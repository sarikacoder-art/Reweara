import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const api = axios.create({ baseURL: API });
api.interceptors.request.use(config => {
  const token = localStorage.getItem("reweara_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const demoItems = [
  { _id: "demo1", title: "Midnight Satin Evening Dress", category: "Dress", size: "M", condition: "Like new", pricePerDay: 280, securityDeposit: 500, area: "Campus North", images: ["https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=900&q=85"], description: "An elegant satin dress for dinners, parties and special events.", owner: { name: "Aanya", area: "Campus North" }, demo: true },
  { _id: "demo2", title: "Classic Ivory Festive Set", category: "Traditional", size: "S", condition: "Good", pricePerDay: 350, securityDeposit: 700, area: "Student Square", images: ["https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=85"], description: "A festive outfit for celebrations and family functions.", owner: { name: "Meera", area: "Student Square" }, demo: true },
  { _id: "demo3", title: "Tailored Charcoal Blazer", category: "Suit", size: "L", condition: "Like new", pricePerDay: 220, securityDeposit: 400, area: "Campus East", images: ["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=85"], description: "A smart, versatile layer for presentations and formal events.", owner: { name: "Rohan", area: "Campus East" }, demo: true },
  { _id: "demo4", title: "Rose Gold Party Outfit", category: "Dress", size: "M", condition: "Good", pricePerDay: 300, securityDeposit: 600, area: "Student Square", images: ["https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=900&q=85"], description: "A statement look for birthdays, college nights and parties.", owner: { name: "Isha", area: "Student Square" }, demo: true },
  { _id: "demo5", title: "Minimal Linen Co-ord", category: "Other", size: "S", condition: "Like new", pricePerDay: 180, securityDeposit: 300, area: "Campus West", images: ["https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=85"], description: "An effortless outfit for daytime events and casual outings.", owner: { name: "Kavya", area: "Campus West" }, demo: true },
  { _id: "demo6", title: "Emerald Occasion Gown", category: "Dress", size: "L", condition: "Good", pricePerDay: 400, securityDeposit: 800, area: "Campus North", images: ["https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=900&q=85"], description: "A bold occasion gown for formal evenings and celebrations.", owner: { name: "Diya", area: "Campus North" }, demo: true }
];

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("reweara_user") || "null"));
  const [items, setItems] = useState(demoItems);
  const [notice, setNotice] = useState("");
  const [apiOnline, setApiOnline] = useState(false);
  useEffect(() => { api.get("/health").then(() => setApiOnline(true)).catch(() => setApiOnline(false)); }, []);
  const refreshItems = async (params = {}) => {
    try {
      const { data } = await api.get("/items", { params });
      setItems(data.items);
      setApiOnline(true);
    } catch { setApiOnline(false); }
  };
  useEffect(() => { refreshItems(); }, []);
  const login = result => {
    localStorage.setItem("reweara_token", result.token);
    localStorage.setItem("reweara_user", JSON.stringify(result.user));
    setUser(result.user); setNotice(`Welcome, ${result.user.name}!`);
  };
  const logout = () => {
    localStorage.removeItem("reweara_token"); localStorage.removeItem("reweara_user");
    setUser(null); setNotice("You have been logged out.");
  };
  return <div className="app-shell">
    <header className="topbar">
      <Link to="/" className="brand"><span className="brand-mark">r</span><span>reweara<span className="brand-dot">.</span></span></Link>
      <nav><NavLink to="/" end>Discover</NavLink><NavLink to="/how-it-works">How it works</NavLink>{user && <><NavLink to="/dashboard">My rentals</NavLink><NavLink to="/dashboard?tab=listings">My Listings</NavLink></>}</nav>
      <div className="nav-actions">{user ? <><span className="user-chip">{user.name?.split(" ")[0]}</span><button className="button button-quiet button-small" onClick={logout}>Log out</button></> : <Link className="button button-dark button-small" to="/auth">Join Reweara <span>↗</span></Link>}</div>
    </header>
    {notice && <button className="notice" onClick={() => setNotice("")}>{notice} <span>×</span></button>}
    <Routes>
      <Route path="/" element={<Home items={items} refreshItems={refreshItems} user={user} setNotice={setNotice} />} />
      <Route path="/auth" element={<Auth onLogin={login} />} />
      <Route path="/items/:id" element={<ItemDetail items={items} user={user} setNotice={setNotice} />} />
      <Route path="/dashboard" element={<Dashboard user={user} setNotice={setNotice} />} />
      <Route path="/how-it-works" element={<How />} />
      <Route path="*" element={<Home items={items} refreshItems={refreshItems} user={user} setNotice={setNotice} />} />
    </Routes>
    <footer><Link to="/" className="brand footer-brand"><span className="brand-mark">r</span><span>reweara<span className="brand-dot">.</span></span></Link><p>Good outfits deserve more than one night out.</p><span className={`api-status ${apiOnline ? "online" : ""}`}><i /> {apiOnline ? "Connected to API" : "Preview mode · connect MongoDB to go live"}</span></footer>
  </div>;
}

function Home({ items, refreshItems, user, setNotice }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All styles");
  const [maxPrice, setMaxPrice] = useState("1000");
  const [showForm, setShowForm] = useState(false);
  const filtered = useMemo(() => items.filter(item =>
    (category === "All styles" || item.category === category) &&
    (Number(item.pricePerDay || 0) <= Number(maxPrice || 999999)) &&
    `${item.title} ${item.description} ${item.area} ${item.category}`.toLowerCase().includes(query.toLowerCase())
  ), [items, query, category, maxPrice]);
  const doSearch = async () => {
    try { await refreshItems({ q: query || undefined, category: category === "All styles" ? undefined : category, maxPrice: maxPrice || undefined }); }
    catch {}
  };
  return <main>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" /> THE CAMPUS CLOSET, REIMAGINED</div>
        <h1>Your next<br/><em>look</em> is closer<br/>than you think.</h1>
        <p className="hero-text">Rent the outfit. Own the moment. Discover occasionwear from people around your campus, without the full-price commitment.</p>
        <div className="hero-buttons"><a href="#discover" className="button button-dark">Explore the closet <span>↓</span></a><button className="button button-outline" onClick={() => {
          if (!user) { window.location.href = "/auth"; return; }
          setShowForm(true);
          window.setTimeout(() => document.getElementById("listing-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
        }}>List an outfit <span>↗</span></button></div>
        <div className="hero-proof"><div className="avatar-stack"><span>A</span><span>M</span><span>I</span><span>+</span></div><div><strong>Shared style, local community</strong><small>Better outfits. Less waste.</small></div></div>
      </div>
      <div className="hero-visual"><div className="hero-image-main"><img src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1200&q=90" alt="Fashion look" /></div><div className="hero-image-float"><img src="https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=500&q=85" alt="Occasion dress" /></div><div className="floating-note"><span className="note-icon">✳</span><span><strong>Wear it. Return it.</strong><small>Keep the good memories.</small></span></div><span className="hero-number">01 / THE SHARED WARDROBE</span></div>
      <div className="hero-bottom"><span>STYLE THAT CIRCULATES</span><span>LOCAL FINDS · LOWER COST · LESS WASTE</span><span>EST. FOR YOUR CAMPUS</span></div>
    </section>
    {showForm && <section id="listing-form" className="quick-list panel"><div className="section-heading"><div><div className="eyebrow">YOUR WARDROBE, YOUR EARNINGS</div><h2>List an outfit</h2></div><button className="button button-quiet" onClick={() => setShowForm(false)}>Close ×</button></div><ItemForm onDone={() => { setShowForm(false); refreshItems(); setNotice("Your listing is live!"); }} /></section>}
    <section className="discover-section" id="discover">
      <div className="section-heading"><div><div className="eyebrow">THE LOCAL CLOSET</div><h2>Find your <em>occasion</em> look.</h2><p>Good style is already around you. You just haven't met it yet.</p></div><span className="result-count">{filtered.length.toString().padStart(2, "0")} PIECES</span></div>
      <div className="filter-bar"><label className="search-field"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} placeholder="Search dresses, blazers, festive looks..." /></label><select value={category} onChange={e => { setCategory(e.target.value); }}><option>All styles</option>{["Dress","Traditional","Suit","Top","Bottom","Outerwear","Other"].map(x => <option key={x}>{x}</option>)}</select><select value={maxPrice} onChange={e => setMaxPrice(e.target.value)}><option value="1000">Any price</option><option value="200">Under ₹200/day</option><option value="300">Under ₹300/day</option><option value="500">Under ₹500/day</option></select><button className="button button-dark button-small" onClick={doSearch}>Search</button></div>
      <div className="product-grid">{filtered.map((item, i) => <ProductCard key={item._id} item={item} index={i} />)}</div>
      {filtered.length === 0 && <div className="empty-state"><span>✳</span><h3>No looks found just yet</h3><p>Try another search or price range.</p><button className="button button-outline" onClick={() => {setQuery("");setCategory("All styles");setMaxPrice("1000");refreshItems();}}>Clear filters</button></div>}
      <div className="browse-bottom"><span>YOUR NEXT EVENT IS COVERED</span><span>— REWEARA LOCAL CLOSET</span></div>
    </section>
    <section className="sell-banner"><div className="sell-symbol">✳</div><div><div className="eyebrow">MAKE ROOM. MAKE MONEY.</div><h2>Your closet has<br/><em>untapped potential.</em></h2><p>That outfit you wore once? Someone nearby would love it for their big night.</p></div><button className="button button-light" onClick={() => {
      if (!user) { window.location.href = "/auth"; return; }
      setShowForm(true);
      window.setTimeout(() => document.getElementById("listing-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }}>List your first piece <span>↗</span></button></section>
    <How />
  </main>;
}

function ProductCard({ item, index }) {
  const image = item.images?.[0] || "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80";
  return <Link to={`/items/${item._id}`} className="product-card">
    <div className="product-image"><img src={image} alt={item.title} loading={index > 2 ? "lazy" : "eager"} /><span className="product-tag">{item.condition || "Good condition"}</span><button className="heart-button" onClick={e => { e.preventDefault(); alert("Wishlist will be available after sign-in in the next iteration."); }}>♡</button></div>
    <div className="product-info"><div className="product-meta"><span>{item.category} · Size {item.size}</span><span>↗</span></div><h3>{item.title}</h3><div className="product-bottom"><div><strong>₹{item.pricePerDay}</strong><span> / day</span></div><span className="product-area">⌖ {item.area || item.owner?.area || "Near campus"}</span></div></div>
  </Link>;
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState("register");
  const [form, setForm] = useState({ name: "", email: "", password: "", area: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const { data } = await api.post(`/auth/${mode}`, form);
      onLogin(data); navigate("/");
    } catch (err) { setError(err.response?.data?.message || "Could not connect. Start the backend and configure MongoDB first."); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><div className="auth-art"><div className="eyebrow">A CLOSET THAT CIRCULATES</div><h1>Good clothes.<br/><em>More stories.</em></h1><img src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85" alt="Fashion" /><p>Join your local style community.</p></div><div className="auth-form-wrap"><div className="eyebrow">WELCOME TO REWEARA</div><h2>{mode === "register" ? "Make yourself at home." : "Welcome back."}</h2><p>{mode === "register" ? "Your next favourite outfit is waiting." : "Your closet is right where you left it."}</p><div className="auth-tabs"><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Log in</button></div><form onSubmit={submit}>{mode === "register" && <><label>Full name<input name="name" value={form.name} onChange={change} required placeholder="Your name" /></label><label>Campus / area<input name="area" value={form.area} onChange={change} placeholder="e.g. Campus North" /></label></>}<label>Email address<input name="email" type="email" value={form.email} onChange={change} required placeholder="you@example.com" /></label><label>Password<input name="password" type="password" minLength="8" value={form.password} onChange={change} required placeholder="At least 8 characters" /></label>{error && <p className="error-text">{error}</p>}<button className="button button-dark full-button" disabled={busy}>{busy ? "Please wait..." : mode === "register" ? "Create your account ↗" : "Log in ↗"}</button></form><small className="form-note">By continuing, you agree to use Reweara responsibly and respect each lender's rental rules.</small></div></main>;
}

function ItemDetail({ items, user, setNotice }) {
  const { id } = useParams();
  const [item, setItem] = useState(items.find(x => x._id === id));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (!item || !item.demo) api.get(`/items/${id}`).then(r => setItem(r.data.item)).catch(() => {}); }, [id]);
  const days = startDate && endDate ? Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000)) : 0;
  const request = async () => {
    if (!user) return window.location.href = "/auth";
    if (item?.demo) return setError("This is a preview item. Connect MongoDB and create a real listing to request it.");
    if (!accepted) return setError("Please accept the rental rules.");
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/bookings", { itemId: item._id, startDate, endDate, acceptRules: accepted });
      setNotice(`Booking request created: ${data.booking._id}`); window.location.href = "/dashboard";
    } catch (e) { setError(e.response?.data?.message || "Could not create request"); }
    finally { setLoading(false); }
  };
  if (!item) return <main className="page-container"><p>Loading listing…</p><Link to="/">← Back to discover</Link></main>;
  const rules = [item.careRules?.mustWash !== false ? "Return washed" : "Follow the cleaning instructions", item.careRules?.mustIron !== false ? "Return ironed" : "Follow the care instructions", "Return by the agreed date and time", item.careRules?.otherRules].filter(Boolean);
  return <main className="detail-page"><Link to="/" className="back-link">← Back to the closet</Link><div className="detail-layout"><div className="detail-photo"><img src={item.images?.[0]} alt={item.title} /></div><div className="detail-copy"><div className="eyebrow">{item.category} · SIZE {item.size}</div><h1>{item.title}</h1><p className="detail-description">{item.description}</p><div className="detail-price"><strong>₹{item.pricePerDay}</strong><span>/ day</span><span className="deposit-pill">₹{item.securityDeposit} refundable deposit*</span></div><div className="owner-row"><div className="owner-avatar">{item.owner?.name?.[0] || "R"}</div><div><strong>Listed by {item.owner?.name || "Campus community"}</strong><small>⌖ {item.area || item.owner?.area || "Near campus"}</small></div></div><div className="rule-box"><h3>Rental rules</h3>{rules.map(rule => <div className="rule-row" key={rule}><span>✓</span>{rule}</div>)}</div><div className="date-fields"><label>Pickup date<input type="date" value={startDate} min={new Date().toISOString().slice(0,10)} onChange={e => setStartDate(e.target.value)} /></label><label>Return date<input type="date" value={endDate} min={startDate || new Date().toISOString().slice(0,10)} onChange={e => setEndDate(e.target.value)} /></label></div>{days > 0 && <div className="price-summary"><span>{days} day(s) × ₹{item.pricePerDay}</span><strong>₹{days * item.pricePerDay + Number(item.securityDeposit || 0)} total including deposit</strong></div>}<label className="agree-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>I agree to the rental rules and return the outfit in the agreed condition.</span></label>{error && <p className="error-text">{error}</p>}<button className="button button-dark full-button" onClick={request} disabled={loading || !startDate || !endDate}>{loading ? "Sending request..." : "Request to rent ↗"}</button><small className="form-note">*Deposit outcome follows the booking agreement and supported payment workflow. No payment is collected in preview mode.</small></div></div></main>;
}

function ItemForm({ onDone }) {
  const [form, setForm] = useState({ title: "", description: "", category: "Dress", size: "M", condition: "Good", pricePerDay: "250", securityDeposit: "500", images: "", area: "", otherRules: "" });
  const [error, setError] = useState("");
  const submit = async e => {
    e.preventDefault(); setError("");
    try {
      await api.post("/items", { ...form, pricePerDay: Number(form.pricePerDay), securityDeposit: Number(form.securityDeposit), images: form.images ? [form.images] : [], careRules: { mustWash: true, mustIron: true, otherRules: form.otherRules } });
      onDone();
    } catch (e) { setError(e.response?.data?.message || "Could not create listing"); }
  };
  return <form className="listing-form" onSubmit={submit}><div className="form-grid"><label>Outfit title<input required value={form.title} onChange={e => setForm({...form,title:e.target.value})} placeholder="e.g. Satin evening dress" /></label><label>Category<select value={form.category} onChange={e => setForm({...form,category:e.target.value})}>{["Dress","Traditional","Suit","Top","Bottom","Outerwear","Other"].map(x=><option key={x}>{x}</option>)}</select></label><label>Size<input required value={form.size} onChange={e => setForm({...form,size:e.target.value})} /></label><label>Condition<select value={form.condition} onChange={e => setForm({...form,condition:e.target.value})}>{["New","Like new","Good","Fair"].map(x=><option key={x}>{x}</option>)}</select></label><label>Price per day (₹)<input type="number" min="1" required value={form.pricePerDay} onChange={e => setForm({...form,pricePerDay:e.target.value})} /></label><label>Security deposit (₹)<input type="number" min="0" required value={form.securityDeposit} onChange={e => setForm({...form,securityDeposit:e.target.value})} /></label><label className="span-two">Image URL<input type="url" value={form.images} onChange={e => setForm({...form,images:e.target.value})} placeholder="Paste a hosted image URL" /></label><label className="span-two">Description<textarea required rows="3" value={form.description} onChange={e => setForm({...form,description:e.target.value})} placeholder="Describe the fit, style and occasion..." /></label><label className="span-two">Area / pickup neighbourhood<input value={form.area} onChange={e => setForm({...form,area:e.target.value})} placeholder="Approximate area only" /></label><label className="span-two">Extra rental rules<textarea rows="2" value={form.otherRules} onChange={e => setForm({...form,otherRules:e.target.value})} placeholder="Any special care or pickup notes" /></label></div>{error && <p className="error-text">{error}</p>}<button className="button button-dark">Publish listing ↗</button></form>;
}

function Dashboard({ user, setNotice }) {
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState([]);
  const [mine, setMine] = useState([]);
  const [error, setError] = useState("");
  const [active, setActive] = useState(() => searchParams.get("tab") === "listings" ? "listings" : "bookings");
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatKey, setChatKey] = useState(0);
  const load = async () => {
    try { const [b, m] = await Promise.all([api.get("/bookings/my"), api.get("/items/mine")]); setBookings(b.data.bookings); setMine(m.data.items); setError(""); }
    catch (e) { setError(e.response?.data?.message || "Please log in to view your dashboard."); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "listings" || tab === "bookings") setActive(tab);
  }, [searchParams]);
  const action = async (path, body = {}) => {
    try { await api.patch(path, body); setNotice("Updated successfully"); await load(); }
    catch (e) { setError(e.response?.data?.message || "Action failed"); }
  };
  const payForBooking = async booking => {
    try {
      setError("");
      const { data: order } = await api.post("/payments/order", { bookingId: booking._id });

      const checkoutLoaded = await new Promise(resolve => {
        if (window.Razorpay) return resolve(true);
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
      });
      if (!checkoutLoaded) throw new Error("Could not load Razorpay Checkout. Check your internet connection and try again.");

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Reweara",
        description: `Rental payment for ${booking.item?.title || "your outfit"}`,
        order_id: order.orderId,
        prefill: { name: user.name || "", email: user.email || "" },
        theme: { color: "#263d32" },
        handler: async response => {
          try {
            await api.post("/payments/verify", { bookingId: booking._id, ...response });
            setNotice("Payment verified successfully!");
            await load();
          } catch (e) {
            setError(e.response?.data?.message || "Payment was received by checkout but verification failed. Please contact support before trying again.");
          }
        },
        modal: { ondismiss: () => setNotice("Checkout closed. No payment was confirmed.") }
      });
      checkout.on("payment.failed", response => {
        setError(response.error?.description || "Payment failed. Please try again.");
      });
      checkout.open();
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Could not start payment.");
    }
  };
  if (!user) return <main className="page-container"><h1>Your rentals</h1><p>Sign in to manage your bookings and listings.</p><Link className="button button-dark" to="/auth">Sign in ↗</Link></main>;
  return <main className="dashboard-page"><div className="eyebrow">YOUR REWEARA SPACE</div><h1>Good to see you, <em>{user.name?.split(" ")[0]}.</em></h1><p className="dashboard-intro">Keep track of your listings, requests and rentals.</p><div className="dashboard-tabs"><button className={active==="bookings"?"active":""} onClick={()=>setActive("bookings")}>Bookings ({bookings.length})</button><button className={active==="listings"?"active":""} onClick={()=>setActive("listings")}>My listings ({mine.length})</button></div>{error && <p className="error-text">{error}</p>}
    {active==="bookings" && <div className="booking-list">{bookings.map(b => { const isLender = b.lender?._id === user.id || b.lender === user.id; return <article className="booking-card" key={b._id}><div className="booking-thumb"><img src={b.item?.images?.[0] || "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=400&q=80"} alt="" /></div><div className="booking-info"><span className={`status status-${b.status}`}>{b.status.replace("_"," ")}</span><h3>{b.item?.title || "Clothing rental"}</h3><p>{new Date(b.startDate).toLocaleDateString()} – {new Date(b.endDate).toLocaleDateString()}</p><p>₹{b.rentalAmount} rental + ₹{b.securityDeposit} deposit</p><small>{isLender ? `Renter: ${b.renter?.name}` : `Lender: ${b.lender?.name}`}</small><div className="booking-actions">{isLender && b.status==="pending" && <><button className="button button-dark button-small" onClick={()=>action(`/bookings/${b._id}/decision`,{decision:"accept"})}>Accept</button><button className="button button-outline button-small" onClick={()=>action(`/bookings/${b._id}/decision`,{decision:"reject"})}>Reject</button></>}{!isLender && b.status==="accepted" && <button className="button button-dark button-small" onClick={()=>payForBooking(b)}>Pay & deposit</button>}{["accepted","paid","picked_up","return_requested"].includes(b.status) && <button className="button button-outline button-small" onClick={()=>{setSelectedChat(b);setChatKey(x=>x+1);}}>Open chat</button>}{["accepted","paid"].includes(b.status) && <button className="button button-outline button-small" onClick={()=>action(`/bookings/${b._id}/pickup`)}>Confirm pickup</button>}{b.status==="picked_up" && !isLender && <button className="button button-dark button-small" onClick={()=>action(`/bookings/${b._id}/return`)}>Request return</button>}{b.status==="return_requested" && isLender && <button className="button button-dark button-small" onClick={()=>action(`/bookings/${b._id}/complete`)}>Confirm returned</button>}</div></div></article>})}{!bookings.length && <div className="empty-state"><span>✳</span><h3>Your next outfit starts here.</h3><p>Find something special in the local closet.</p><Link className="button button-dark" to="/">Explore outfits</Link></div>}</div>}
    {active==="listings" && <div className="my-listings"><div className="listing-tools"><h2>Your pieces</h2><Link className="button button-dark button-small" to="/">Browse and list</Link></div><div className="product-grid">{mine.map((item,i)=><ProductCard item={item} index={i} key={item._id}/>)}</div>{!mine.length && <p>You haven't listed anything yet. Use “List an outfit” on the home page.</p>}</div>}
    {selectedChat && <Chat key={chatKey} booking={selectedChat} user={user} onClose={()=>setSelectedChat(null)} />}
  </main>;
}

function Chat({ booking, user, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const socket = useMemo(() => io(SOCKET_URL, { autoConnect: false, auth: { token: localStorage.getItem("reweara_token") } }), []);
  useEffect(() => {
    api.get(`/bookings/${booking._id}/messages`).then(r => setMessages(r.data.messages)).catch(e => setError(e.response?.data?.message || "Could not load messages"));
    socket.connect();
    socket.on("connect", () => socket.emit("booking:join", { bookingId: booking._id }, response => { if (response?.error) setError(response.error); }));
    socket.on("booking:message", message => setMessages(old => old.some(m => m._id === message._id) ? old : [...old, message]));
    socket.on("connect_error", e => setError(e.message));
    return () => { socket.disconnect(); };
  }, [socket, booking._id]);
  const send = e => {
    e.preventDefault(); if (!text.trim()) return;
    socket.emit("booking:message", { bookingId: booking._id, text }, result => {
      if (result?.error) setError(result.error); else { setText(""); setError(""); }
    });
  };
  return <div className="chat-overlay"><div className="chat-window"><div className="chat-head"><div><strong>Rental chat</strong><small>{booking.item?.title}</small></div><button onClick={onClose}>×</button></div><div className="chat-messages">{messages.map(m=><div key={m._id} className={`chat-message ${m.sender?._id===user.id || m.sender===user.id ? "mine":""}`}><small>{m.sender?.name || "Member"}</small><p>{m.text}</p><time>{new Date(m.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></div>)}{!messages.length && <p className="chat-empty">Say hello and coordinate your pickup.</p>}</div>{error && <p className="error-text chat-error">{error}</p>}<form onSubmit={send} className="chat-input"><input value={text} onChange={e=>setText(e.target.value)} placeholder="Write a message..." /><button className="button button-dark button-small">Send ↗</button></form></div></div>;
}

function How() {
  return <section className="how-section" id="how"><div className="eyebrow">SIMPLE BY DESIGN</div><div className="section-heading"><div><h2>One outfit.<br/><em>Another story.</em></h2></div><p>From the first browse to the final handover, we keep local renting clear, personal and easy.</p></div><div className="steps-grid">{[{n:"01",title:"Find your look",text:"Browse pieces shared by people around your campus."},{n:"02",title:"Agree & book",text:"Choose your dates, read the rules and send a request."},{n:"03",title:"Meet nearby",text:"Coordinate pickup and return in your private rental chat."},{n:"04",title:"Return with care",text:"Bring it back as agreed and close the rental together."}].map(s=><div className="step-card" key={s.n}><span>{s.n}</span><div className="step-arrow">↗</div><h3>{s.title}</h3><p>{s.text}</p></div>)}</div></section>;
}

export default App;
