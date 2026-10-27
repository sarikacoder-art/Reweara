const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, trim: true },
  area: { type: String, trim: true, default: "" },
location: {
  type: {
    type: String,
    enum: ["Point"],
    default: "Point"
  },
  coordinates: {
    type: [Number],
    default: [0, 0]
  }
},
  role: { type: String, enum: ["user", "admin"], default: "user" },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
userSchema.index({ location: "2dsphere" });

const itemSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  category: { type: String, required: true, enum: ["Dress", "Traditional", "Suit", "Top", "Bottom", "Outerwear", "Other"] },
  size: { type: String, required: true, trim: true },
  brand: { type: String, trim: true, default: "" },
  images: [{ type: String }],
  condition: { type: String, enum: ["New", "Like new", "Good", "Fair"], default: "Good" },
  pricePerDay: { type: Number, required: true, min: 1 },
  securityDeposit: { type: Number, required: true, min: 0, default: 0 },
  careRules: {
    mustWash: { type: Boolean, default: true },
    mustIron: { type: Boolean, default: true },
    otherRules: { type: String, trim: true, default: "" }
  },
  area: { type: String, trim: true, default: "" },
  location: {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: undefined }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
itemSchema.index({ location: "2dsphere" });
itemSchema.index({ title: "text", description: "text", brand: "text" });

const bookingSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: "ClothingItem", required: true },
  renter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  agreedPricePerDay: { type: Number, required: true },
  rentalAmount: { type: Number, required: true },
  securityDeposit: { type: Number, required: true },
  totalDue: { type: Number, required: true },
  status: { type: String, enum: ["pending", "accepted", "rejected", "cancelled", "paid", "picked_up", "return_requested", "completed", "disputed"], default: "pending" },
  paymentStatus: { type: String, enum: ["unpaid", "paid", "failed", "refunded"], default: "unpaid" },
  agreement: {
    rulesSnapshot: [{ type: String }],
    acceptedAt: Date,
    version: { type: String, default: "1.0" }
  },
  pickupConfirmedAt: Date,
  returnRequestedAt: Date,
  returnedAt: Date,
  completedAt: Date
}, { timestamps: true });
bookingSchema.index({ item: 1, startDate: 1, endDate: 1, status: 1 });

const messageSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 }
}, { timestamps: true });

const paymentSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
  payer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  provider: { type: String, default: "razorpay" },
  providerOrderId: String,
  providerPaymentId: String,
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  type: { type: String, enum: ["rental", "deposit"], default: "rental" },
  status: { type: String, enum: ["created", "paid", "failed", "refunded"], default: "created" },
  verifiedAt: Date
}, { timestamps: true });

const conditionReportSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  stage: { type: String, enum: ["pickup", "return"], required: true },
  photos: [String],
  notes: { type: String, trim: true, maxlength: 2000, default: "" }
}, { timestamps: true });

module.exports = {
  User: mongoose.model("User", userSchema),
  ClothingItem: mongoose.model("ClothingItem", itemSchema),
  Booking: mongoose.model("Booking", bookingSchema),
  Message: mongoose.model("Message", messageSchema),
  Payment: mongoose.model("Payment", paymentSchema),
  ConditionReport: mongoose.model("ConditionReport", conditionReportSchema)
};
