require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { Server } = require("socket.io");
const { User, ClothingItem, Booking, Message, Payment, ConditionReport } = require("./models");

const app = express();
const server = http.createServer(app);
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const io = new Server(server, { cors: { origin: clientUrl, methods: ["GET", "POST"] } });

app.use(cors({ origin: clientUrl }));
app.use(express.json({ limit: "2mb" }));

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const signToken = user => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
const publicUser = user => ({ id: user._id, name: user.name, email: user.email, area: user.area, role: user.role });
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Authentication required" });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) return res.status(401).json({ message: "Invalid account" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
const isValidId = id => mongoose.isValidObjectId(id);
const rulesFor = item => [
  "Return the item by the agreed end date and time.",
  item.careRules?.mustWash ? "Return the item washed." : "Follow the agreed cleaning instructions.",
  item.careRules?.mustIron ? "Return the item ironed." : "Follow the agreed care instructions.",
  "Both parties should document the item's condition at handover and return.",
  item.careRules?.otherRules || "Handle the item with care and communicate through Reweara."
].filter(Boolean);

app.get("/", (req, res) => res.json({ success: true, app: "Reweara API", status: "running" }));
app.get("/api/health", (req, res) => res.json({ success: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));

// Auth
app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const { name, email, password, area = "" } = req.body;
  if (!name?.trim() || !email?.trim() || !password || password.length < 8)
    return res.status(400).json({ message: "Name, email and password (at least 8 characters) are required" });
  const normalizedEmail = email.trim().toLowerCase();
  if (await User.findOne({ email: normalizedEmail })) return res.status(409).json({ message: "Email already registered" });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash, area });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));
app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || "").trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) return res.status(401).json({ message: "Invalid email or password" });
  res.json({ token: signToken(user), user: publicUser(user) });
}));
app.get("/api/auth/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));
app.patch("/api/auth/location", auth, asyncHandler(async (req, res) => {
  const { longitude, latitude, area } = req.body;
  if (longitude != null && latitude != null) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90)
      return res.status(400).json({ message: "Invalid coordinates" });
    req.user.location = { type: "Point", coordinates: [longitude, latitude] };
  }
  if (typeof area === "string") req.user.area = area.trim().slice(0, 100);
  await req.user.save();
  res.json({ user: publicUser(req.user) });
}));

// Listings
app.get("/api/items", asyncHandler(async (req, res) => {
  const { q, category, size, maxPrice, longitude, latitude, radius = 2000 } = req.query;
  const filter = { isActive: true };
  if (category) filter.category = category;
  if (size) filter.size = size;
  if (maxPrice && Number.isFinite(Number(maxPrice))) filter.pricePerDay = { $lte: Number(maxPrice) };
  if (q) filter.$text = { $search: String(q).slice(0, 100) };
  if (longitude != null && latitude != null && Number.isFinite(Number(longitude)) && Number.isFinite(Number(latitude))) {
    filter.location = { $near: { $geometry: { type: "Point", coordinates: [Number(longitude), Number(latitude)] }, $maxDistance: Math.min(Math.max(Number(radius) || 2000, 100), 2000) } };
  }
  const items = await ClothingItem.find(filter).populate("owner", "name area").limit(60).lean();
  res.json({ items });
}));
app.get("/api/items/mine", auth, asyncHandler(async (req, res) => {
  const items = await ClothingItem.find({ owner: req.user._id }).sort({ createdAt: -1 });
  res.json({ items });
}));
app.get("/api/items/:id", asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid item ID" });
  const item = await ClothingItem.findOne({ _id: req.params.id, isActive: true }).populate("owner", "name area");
  if (!item) return res.status(404).json({ message: "Item not found" });
  res.json({ item });
}));
app.post("/api/items", auth, asyncHandler(async (req, res) => {
  const { title, description, category, size, brand, images = [], condition = "Good", pricePerDay, securityDeposit = 0, careRules = {}, area = "" } = req.body;
  if (!title?.trim() || !description?.trim() || !category || !size?.trim() || !Number.isFinite(Number(pricePerDay)) || Number(pricePerDay) <= 0 || !Number.isFinite(Number(securityDeposit)) || Number(securityDeposit) < 0)
    return res.status(400).json({ message: "Please provide title, description, category, size and valid prices" });
  if (!Array.isArray(images) || images.some(url => typeof url !== "string")) return res.status(400).json({ message: "Images must be a list of URLs" });
  const item = await ClothingItem.create({
    owner: req.user._id, title: title.trim(), description: description.trim(), category, size: size.trim(), brand,
    images: images.slice(0, 8), condition, pricePerDay: Number(pricePerDay), securityDeposit: Number(securityDeposit),
    careRules, area: String(area || req.user.area || "").trim(),
    ...(req.user.location?.coordinates ? { location: req.user.location } : {})
  });
  res.status(201).json({ item });
}));
app.patch("/api/items/:id", auth, asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid item ID" });
  const item = await ClothingItem.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Item not found" });
  if (!item.owner.equals(req.user._id)) return res.status(403).json({ message: "Only the owner can edit this item" });
  const allowed = ["title", "description", "category", "size", "brand", "images", "condition", "pricePerDay", "securityDeposit", "careRules", "area", "isActive"];
  for (const key of allowed) if (req.body[key] !== undefined) item[key] = req.body[key];
  await item.save();
  res.json({ item });
}));
app.delete("/api/items/:id", auth, asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid item ID" });
  const item = await ClothingItem.findById(req.params.id);
  if (!item) return res.status(404).json({ message: "Item not found" });
  if (!item.owner.equals(req.user._id)) return res.status(403).json({ message: "Only the owner can remove this item" });
  item.isActive = false;
  await item.save();
  res.json({ success: true, message: "Listing removed" });
}));

// Bookings
app.post("/api/bookings", auth, asyncHandler(async (req, res) => {
  const { itemId, startDate, endDate, acceptRules } = req.body;
  if (!isValidId(itemId)) return res.status(400).json({ message: "Invalid item ID" });
  if (acceptRules !== true) return res.status(400).json({ message: "You must accept the rental rules" });
  const start = new Date(startDate), end = new Date(endDate);
  if (!startDate || !endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || start < new Date(Date.now() - 60 * 1000))
    return res.status(400).json({ message: "Choose valid future rental dates" });
  const item = await ClothingItem.findOne({ _id: itemId, isActive: true });
  if (!item) return res.status(404).json({ message: "Item not found" });
  if (item.owner.equals(req.user._id)) return res.status(400).json({ message: "You cannot rent your own listing" });
  const overlap = await Booking.findOne({
    item: item._id, status: { $in: ["pending", "accepted", "paid", "picked_up", "return_requested", "disputed"] },
    startDate: { $lt: end }, endDate: { $gt: start }
  });
  if (overlap) return res.status(409).json({ message: "This item is already requested/booked for overlapping dates" });
  const days = Math.max(1, Math.ceil((end - start) / 86400000));
  const rentalAmount = days * item.pricePerDay;
  const securityDeposit = item.securityDeposit;
  const booking = await Booking.create({
    item: item._id, renter: req.user._id, lender: item.owner, startDate: start, endDate: end,
    agreedPricePerDay: item.pricePerDay, rentalAmount, securityDeposit, totalDue: rentalAmount + securityDeposit,
    agreement: { rulesSnapshot: rulesFor(item), acceptedAt: new Date(), version: "1.0" }
  });
  res.status(201).json({ booking });
}));
app.get("/api/bookings/my", auth, asyncHandler(async (req, res) => {
  const bookings = await Booking.find({ $or: [{ renter: req.user._id }, { lender: req.user._id }] })
    .populate("item", "title images pricePerDay area").populate("renter", "name email").populate("lender", "name email").sort({ createdAt: -1 });
  res.json({ bookings });
}));
app.patch("/api/bookings/:id/decision", auth, asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid booking ID" });
  const { decision } = req.body;
  if (!["accept", "reject"].includes(decision)) return res.status(400).json({ message: "Decision must be accept or reject" });
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.lender.equals(req.user._id)) return res.status(403).json({ message: "Only the lender can decide" });
  if (booking.status !== "pending") return res.status(400).json({ message: "Booking is no longer pending" });
  booking.status = decision === "accept" ? "accepted" : "rejected";
  await booking.save();
  res.json({ booking });
}));
app.patch("/api/bookings/:id/pickup", auth, asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.renter.equals(req.user._id) && !booking.lender.equals(req.user._id)) return res.status(403).json({ message: "Not a participant" });
  if (!["paid", "accepted"].includes(booking.status)) return res.status(400).json({ message: "Booking must be accepted and payment handled first" });
  booking.status = "picked_up"; booking.pickupConfirmedAt = new Date(); await booking.save();
  res.json({ booking });
}));
app.patch("/api/bookings/:id/return", auth, asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.renter.equals(req.user._id)) return res.status(403).json({ message: "Only the renter can request return" });
  if (booking.status !== "picked_up") return res.status(400).json({ message: "Item must be picked up first" });
  booking.status = "return_requested"; booking.returnRequestedAt = new Date(); await booking.save();
  res.json({ booking });
}));
app.patch("/api/bookings/:id/complete", auth, asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.lender.equals(req.user._id)) return res.status(403).json({ message: "Only the lender can confirm return" });
  if (booking.status !== "return_requested") return res.status(400).json({ message: "Renter must request return first" });
  booking.status = "completed"; booking.returnedAt = new Date(); booking.completedAt = new Date(); await booking.save();
  res.json({ booking, message: "Rental completed. Deposit resolution should be processed according to your payment provider's supported workflow." });
}));
app.post("/api/bookings/:id/condition-reports", auth, asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.renter.equals(req.user._id) && !booking.lender.equals(req.user._id)) return res.status(403).json({ message: "Not a participant" });
  const { stage, photos = [], notes = "" } = req.body;
  if (!["pickup", "return"].includes(stage)) return res.status(400).json({ message: "Stage must be pickup or return" });
  const report = await ConditionReport.create({ booking: booking._id, submittedBy: req.user._id, stage, photos: Array.isArray(photos) ? photos.slice(0, 8) : [], notes });
  res.status(201).json({ report });
}));

// Message history
app.get("/api/bookings/:id/messages", auth, asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.renter.equals(req.user._id) && !booking.lender.equals(req.user._id)) return res.status(403).json({ message: "Not a participant" });
  const messages = await Message.find({ booking: booking._id }).populate("sender", "name").sort({ createdAt: 1 }).limit(300);
  res.json({ messages });
}));

// Payment scaffold: use Razorpay TEST keys. This does not provide escrow by itself.
function razorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    console.error("Razorpay configuration is missing.");
    return null;
  }

  if (!keyId.startsWith("rzp_test_")) {
    console.error("Expected a Razorpay TEST key ID.");
    return null;
  }

  if (keyId.includes("YOUR") || keySecret.includes("YOUR")) {
    console.error("Razorpay credentials still contain placeholders.");
    return null;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
}
app.post("/api/payments/order", auth, asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  if (!isValidId(bookingId)) return res.status(400).json({ message: "Invalid booking ID" });
  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.renter.equals(req.user._id)) return res.status(403).json({ message: "Only the renter can pay" });
  if (booking.status !== "accepted" || booking.paymentStatus === "paid") return res.status(400).json({ message: "Booking must be accepted and unpaid" });
  const client = razorpayClient();
  if (!client) return res.status(503).json({ message: "Payment gateway is not configured. Add Razorpay test keys to server/.env." });
  const order = await client.orders.create({ amount: Math.round(booking.totalDue * 100), currency: "INR", receipt: `booking_${booking._id}` });
  const payment = await Payment.create({ booking: booking._id, payer: req.user._id, providerOrderId: order.id, amount: booking.totalDue, type: "rental" });
  res.status(201).json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, paymentId: payment._id });
}));
app.post("/api/payments/verify", auth, asyncHandler(async (req, res) => {
  const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!isValidId(bookingId)) return res.status(400).json({ message: "Invalid booking ID" });
  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  if (!booking.renter.equals(req.user._id)) return res.status(403).json({ message: "Only the renter can verify payment" });
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "").update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  if (!process.env.RAZORPAY_KEY_SECRET || expected !== razorpay_signature) return res.status(400).json({ message: "Payment signature verification failed" });
  const payment = await Payment.findOne({ booking: booking._id, providerOrderId: razorpay_order_id });
  if (!payment) return res.status(404).json({ message: "Payment order not found" });
  payment.providerPaymentId = razorpay_payment_id; payment.status = "paid"; payment.verifiedAt = new Date(); await payment.save();
  booking.paymentStatus = "paid"; booking.status = "paid"; await booking.save();
  res.json({ success: true, booking });
}));

// Socket.IO: authenticate socket with auth.token; only booking participants can join.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) return next(new Error("Invalid user"));
    socket.user = user;
    next();
  } catch { next(new Error("Invalid token")); }
});
io.on("connection", socket => {
  socket.on("booking:join", async ({ bookingId } = {}, callback = () => {}) => {
    try {
      if (!isValidId(bookingId)) return callback({ error: "Invalid booking ID" });
      const booking = await Booking.findById(bookingId);
      if (!booking || (!booking.renter.equals(socket.user._id) && !booking.lender.equals(socket.user._id))) return callback({ error: "Not authorized for this booking" });
      if (["completed", "rejected", "cancelled"].includes(booking.status)) return callback({ error: "Chat is closed for this booking" });
      socket.join(`booking:${bookingId}`);
      callback({ success: true });
    } catch { callback({ error: "Could not join chat" }); }
  });
  socket.on("booking:message", async ({ bookingId, text } = {}, callback = () => {}) => {
    try {
      if (!isValidId(bookingId) || typeof text !== "string" || !text.trim()) return callback({ error: "Message is required" });
      const booking = await Booking.findById(bookingId);
      if (!booking || (!booking.renter.equals(socket.user._id) && !booking.lender.equals(socket.user._id))) return callback({ error: "Not authorized" });
      if (["completed", "rejected", "cancelled"].includes(booking.status)) return callback({ error: "Chat is closed" });
      const message = await Message.create({ booking: bookingId, sender: socket.user._id, text: text.trim().slice(0, 2000) });
      const populated = await message.populate("sender", "name");
      io.to(`booking:${bookingId}`).emit("booking:message", populated);
      callback({ success: true });
    } catch { callback({ error: "Could not send message" }); }
  });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 11000) return res.status(409).json({ message: "A record with that value already exists" });
  if (err.name === "ValidationError" || err.name === "CastError") return res.status(400).json({ message: err.message });
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
if (!process.env.JWT_SECRET) {
  console.error("Missing JWT_SECRET. Copy .env.example to .env and set JWT_SECRET.");
  process.exit(1);
}
mongoose.connect(process.env.MONGO_URI || "")
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => console.log(`Reweara API running at http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("MongoDB connection failed. Set MONGO_URI in server/.env.", err.message);
    process.exit(1);
  });
