// src/App.jsx
import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// ----- DUMMY TECHNICIANS & TASKS (for Admin + Technician portals demo) -----
const DUMMY_TECHNICIANS = [
  {
    id: "tech1",
    username: "tech1",
    displayName: "Technician 1",
    specialization: "Lifts & Electrical",
  },
  {
    id: "tech2",
    username: "tech2",
    displayName: "Technician 2",
    specialization: "Plumbing & Civil",
  },
];

const DUMMY_TASKS = [
  {
    id: 1,
    title: "Lift not working – BSN Block",
    building: "BSN Block",
    category: "electricity",
    status: "in_progress",
    technicianId: "tech1",
    responseMinutes: 7,
    resolutionMinutes: null,
    slaMinutes: 30,
  },
  {
    id: 2,
    title: "Lift inspection pending – Lab Block",
    building: "Lab Block",
    category: "electricity",
    status: "pending",
    technicianId: "tech2",
    responseMinutes: null,
    resolutionMinutes: null,
    slaMinutes: 30,
  },
  {
    id: 3,
    title: "Water leakage – Hostel A (2nd Floor)",
    building: "Hostel A",
    category: "water",
    status: "resolved",
    technicianId: "tech1",
    responseMinutes: 10,
    resolutionMinutes: 45,
    slaMinutes: 60,
  },
];

// compute stats & score for a technician
function computeTechStats(techId) {
  const techTasks = DUMMY_TASKS.filter((t) => t.technicianId === techId);
  const total = techTasks.length;
  const resolvedTasks = techTasks.filter((t) => t.status === "resolved");
  const resolvedCount = resolvedTasks.length;
  const pending = techTasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  ).length;

  const respondedTasks = techTasks.filter(
    (t) => typeof t.responseMinutes === "number"
  );
  const responseAvg =
    respondedTasks.length > 0
      ? Math.round(
          respondedTasks.reduce((sum, t) => sum + t.responseMinutes, 0) /
            respondedTasks.length
        )
      : null;

  const resolvedWithTime = resolvedTasks.filter(
    (t) => typeof t.resolutionMinutes === "number"
  );
  const resolutionAvg =
    resolvedWithTime.length > 0
      ? Math.round(
          resolvedWithTime.reduce((sum, t) => sum + t.resolutionMinutes, 0) /
            resolvedWithTime.length
        )
      : null;

  let score = resolvedCount * 10;
  if (responseAvg !== null) score += Math.max(0, 20 - responseAvg);
  if (resolutionAvg !== null) score += Math.max(0, 40 - resolutionAvg);

  return {
    total,
    resolvedCount,
    pending,
    responseAvg,
    resolutionAvg,
    score,
  };
}

// Approximate center of BMSIT campus (you can tweak if needed)
const CAMPUS_CENTER = {
  lat: 13.1045,
  lng: 77.5800,
};

// Colors per issue category
const CATEGORY_COLORS = {
  water: "#1E88E5",
  electricity: "#FBC02D",
  internet: "#E53935", // wifi / internet -> red
  it: "#E53935",
  garbage: "#6D4C41",
  hostel: "#8E24AA",
  other: "#546E7A",
};

// Map component shown in Admin section
function CampusIssueMap({ incidents }) {
  // try to use real incidents with lat/lng
  const markersFromIncidents = (incidents || [])
    .map((inc) => {
      // depending on your backend structure, it might be inc.lat/lng or inc.location.lat/lng
      const lat =
        typeof inc.lat === "number"
          ? inc.lat
          : typeof inc.location?.lat === "number"
          ? inc.location.lat
          : null;
      const lng =
        typeof inc.lng === "number"
          ? inc.lng
          : typeof inc.location?.lng === "number"
          ? inc.location.lng
          : null;

      if (lat === null || lng === null) return null;

      return {
        lat,
        lng,
        category: inc.category,
        title: inc.title,
        building: inc.location?.building,
        priority: inc.priority,
        status: inc.status,
      };
    })
    .filter(Boolean);

  // demo markers if you have no incidents with lat/lng yet
  const fallbackMarkers = [
    {
      lat: CAMPUS_CENTER.lat + 0.0005,
      lng: CAMPUS_CENTER.lng + 0.0005,
      category: "internet",
      title: "WiFi down – BSN Block (demo)",
      building: "BSN Block",
      priority: "high",
      status: "in_progress",
    },
    {
      lat: CAMPUS_CENTER.lat - 0.0004,
      lng: CAMPUS_CENTER.lng - 0.0003,
      category: "water",
      title: "Water leakage – Hostel A (demo)",
      building: "Hostel A",
      priority: "medium",
      status: "pending",
    },
  ];

  const markers =
    markersFromIncidents.length > 0 ? markersFromIncidents : fallbackMarkers;

  return (
    <div className="map-wrapper">
      <MapContainer
        center={[CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]}
        zoom={17}
        scrollWheelZoom={false}
        className="leaflet-map"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {markers.map((m, idx) => {
          const color = CATEGORY_COLORS[m.category] || CATEGORY_COLORS.other;
          return (
            <CircleMarker
              key={idx}
              center={[m.lat, m.lng]}
              radius={10}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>{m.title}</div>
                  {m.building && <div>{m.building}</div>}
                  <div>
                    Category: {m.category} • Priority: {m.priority || "—"}
                  </div>
                  {m.status && <div>Status: {m.status}</div>}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

function App() {
  // which screen we are on
  const [view, setView] = useState("landing"); // landing | studentLogin | adminLogin | technicianLogin | studentDashboard | adminDashboard | technicianDashboard

  // logged-in info
  const [studentInfo, setStudentInfo] = useState(null);
  const [adminInfo, setAdminInfo] = useState(null);
  const [technicianInfo, setTechnicianInfo] = useState(null);

  // login forms
  const [studentLogin, setStudentLogin] = useState({ usn: "", password: "" });
  const [adminLogin, setAdminLogin] = useState({ username: "", password: "" });
  const [technicianLogin, setTechnicianLogin] = useState({
    username: "",
    password: "",
  });
  const [loginError, setLoginError] = useState("");

  // complaint form
  const [form, setForm] = useState({
    reporterName: "",
    reporterEmail: "",
    title: "",
    category: "water",
    description: "",
    imageUrl: "",
    building: "",
    room: "",
    lat: "",
    lng: "",
  });

  const [incidents, setIncidents] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const issuePresets = [
    { label: "Hostel Issue", category: "hostel" },
    { label: "Water Supply", category: "water" },
    { label: "Electricity", category: "electricity" },
    { label: "Internet / IT", category: "internet" },
    { label: "Garbage / Cleanliness", category: "garbage" },
    { label: "Other Campus Issue", category: "other" },
  ];

  // load incidents + predictions once
  useEffect(() => {
    fetchIncidents();
    fetchPredictions();
  }, []);

  async function fetchIncidents() {
    try {
      const res = await axios.get(`${API_URL}/api/incidents`);
      setIncidents(res.data);
    } catch (err) {
      console.error("Error loading incidents:", err.message);
    }
  }

  async function fetchPredictions() {
    try {
      const res = await axios.get(`${API_URL}/api/incidents/predictions`);
      setPredictions(res.data.alerts || []);
    } catch (err) {
      console.error("Error loading predictions:", err.message);
    }
  }

  // handlers
  function handleComplaintChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleStudentLoginChange(e) {
    const { name, value } = e.target;
    setStudentLogin((prev) => ({ ...prev, [name]: value }));
  }

  function handleAdminLoginChange(e) {
    const { name, value } = e.target;
    setAdminLogin((prev) => ({ ...prev, [name]: value }));
  }

  function handleTechnicianLoginChange(e) {
    const { name, value } = e.target;
    setTechnicianLogin((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmitComplaint(e) {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });

    try {
      const body = {
        ...form,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
      };

      const res = await axios.post(`${API_URL}/api/incidents`, body);

      setIncidents((prev) => [res.data, ...prev]);
      setMsg({ type: "success", text: "Complaint submitted successfully." });

      setForm((prev) => ({
        ...prev,
        title: "",
        description: "",
        imageUrl: "",
        building: "",
        room: "",
        lat: "",
        lng: "",
      }));
    } catch (err) {
      console.error(err);
      const text =
        err.response?.data?.message ||
        "Failed to submit complaint. (Backend might not be running yet.)";
      setMsg({ type: "error", text });
    } finally {
      setLoading(false);
    }
  }

  function handleStudentLoginSubmit(e) {
    e.preventDefault();
    setLoginError("");

    if (!studentLogin.usn || !studentLogin.password) {
      setLoginError("Please enter both USN and password.");
      return;
    }

    setStudentInfo({ usn: studentLogin.usn });
    setView("studentDashboard");
  }

  function handleAdminLoginSubmit(e) {
    e.preventDefault();
    setLoginError("");

    if (adminLogin.username === "admin" && adminLogin.password === "admin123") {
      setAdminInfo({ username: adminLogin.username });
      setView("adminDashboard");
    } else {
      setLoginError("Invalid admin credentials. Use admin / admin123 (demo).");
    }
  }

  function handleTechnicianLoginSubmit(e) {
    e.preventDefault();
    setLoginError("");

    const tech = DUMMY_TECHNICIANS.find(
      (t) => t.username === technicianLogin.username
    );

    if (!tech || technicianLogin.password !== "tech123") {
      setLoginError(
        "Invalid technician credentials. Demo users: tech1 or tech2, password: tech123."
      );
      return;
    }

    setTechnicianInfo({
      id: tech.id,
      username: tech.username,
      name: tech.displayName,
    });
    setView("technicianDashboard");
  }

  function handleLogout() {
    setStudentInfo(null);
    setAdminInfo(null);
    setTechnicianInfo(null);
    setStudentLogin({ usn: "", password: "" });
    setAdminLogin({ username: "", password: "" });
    setTechnicianLogin({ username: "", password: "" });
    setLoginError("");
    setView("landing");
  }

  function statusBadge(status) {
    if (status === "in_progress")
      return (
        <span className="status-badge status-in-progress">In Progress</span>
      );
    if (status === "resolved")
      return <span className="status-badge status-resolved">Resolved</span>;
    return <span className="status-badge status-new">New</span>;
  }

  function priorityBadge(priority) {
    if (priority === "high")
      return <span className="priority-badge priority-high">High</span>;
    if (priority === "medium")
      return <span className="priority-badge priority-medium">Medium</span>;
    return <span className="priority-badge priority-low">Low</span>;
  }

  // ---------- LANDING PAGE (BMSIT STYLE) ----------
  if (view === "landing") {
    return (
      <div className="landing-root">
        <div className="bms-topbar">
          {/* ONLY logo + text now (no extra red login buttons) */}
          <div className="bms-logo-wrap">
            <img
              src="/bms-logo.png"
              alt="BMS Institute of Technology & Management"
              className="bms-logo-img"
            />
            <div className="bms-logo-text">
              <div className="bms-logo-main">
                BMS INSTITUTE OF TECHNOLOGY &amp; MANAGEMENT
              </div>
              <div className="bms-logo-sub">
                Yelahanka, Bengaluru – 560064 • Autonomous Institution under VTU
              </div>
            </div>
          </div>
        </div>

        <div className="landing-hero">
          <div className="landing-overlay">
            <div className="landing-content">
              <h1 className="landing-title">
                Welcome to the Campus Smart Complaint Portal.
              </h1>
              <p className="landing-subtitle">
                This portal is for the exclusive use of students, technicians
                and administrators to raise, track and resolve campus
                maintenance issues.
              </p>

              <div className="portal-cards">
                <div className="portal-card">
                  <div className="portal-card-title">FOR STUDENTS</div>
                  <div className="portal-card-sub">
                    Raise complaints related to hostel, water, electricity,
                    internet, garbage and other campus facilities.
                  </div>
                  <button
                    className="portal-card-btn"
                    type="button"
                    onClick={() => {
                      setView("studentLogin");
                      setLoginError("");
                    }}
                  >
                    Click Here
                  </button>
                </div>

                <div className="portal-card">
                  <div className="portal-card-title">FOR TECHNICIANS</div>
                  <div className="portal-card-sub">
                    View your assigned tasks, lift issues, SLA timers and
                    personal performance score.
                  </div>
                  <button
                    className="portal-card-btn"
                    type="button"
                    onClick={() => {
                      setView("technicianLogin");
                      setLoginError("");
                    }}
                  >
                    Click Here
                  </button>
                </div>

                <div className="portal-card">
                  <div className="portal-card-title">
                    FOR ADMIN / MAINTENANCE TEAM
                  </div>
                  <div className="portal-card-sub">
                    Monitor all complaints, see which are resolved, and track
                    technician performance &amp; hotspots.
                  </div>
                  <button
                    className="portal-card-btn"
                    type="button"
                    onClick={() => {
                      setView("adminLogin");
                      setLoginError("");
                    }}
                  >
                    Click Here
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="landing-footer">
          Copyright © Smart Maintenance Portal • Inspired by BMSIT Student
          Portal
        </footer>
      </div>
    );
  }

  // ---------- ALL OTHER VIEWS (LOGIN + DASHBOARDS) ----------
  return (
    <div className="app-root">
      <header className="header">
        <div>
          <div className="header-title">Campus Smart Complaint Portal</div>
          <div className="header-sub">
            Unified maintenance, student complaints, technicians &amp; admin
            monitoring
          </div>
        </div>
        <div className="header-right">
          {studentInfo && (
            <span className="header-chip">Student: {studentInfo.usn}</span>
          )}
          {technicianInfo && (
            <span className="header-chip">
              Technician: {technicianInfo.name}
            </span>
          )}
          {adminInfo && (
            <span className="header-chip">Admin: {adminInfo.username}</span>
          )}
          {(studentInfo || technicianInfo || adminInfo) && (
            <button className="header-logout" onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
      </header>

      <main className="main-layout">
        {/* STUDENT LOGIN */}
        {view === "studentLogin" && (
          <div className="card login-card">
            <div className="login-title">Student Login</div>
            <div className="login-subtitle">
              Enter your USN and password to access the complaint portal.
            </div>

            <form onSubmit={handleStudentLoginSubmit}>
              <div className="form-col">
                <label>USN</label>
                <input
                  name="usn"
                  value={studentLogin.usn}
                  onChange={handleStudentLoginChange}
                  placeholder="1BM23CS001"
                  required
                />
              </div>
              <div className="form-col">
                <label>Password</label>
                <input
                  type="password"
                  name="password"
                  value={studentLogin.password}
                  onChange={handleStudentLoginChange}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="login-actions">
                <button className="btn-primary" type="submit">
                  Login as Student
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setView("landing");
                    setLoginError("");
                  }}
                >
                  Back to home
                </button>
              </div>

              {loginError && <div className="login-error">{loginError}</div>}
            </form>
          </div>
        )}

        {/* TECHNICIAN LOGIN */}
        {view === "technicianLogin" && (
          <div className="card login-card">
            <div className="login-title">Technician Login</div>
            <div className="login-subtitle">
              Demo credentials – Username: <b>tech1</b> or <b>tech2</b>,
              Password: <b>tech123</b>
            </div>

            <form onSubmit={handleTechnicianLoginSubmit}>
              <div className="form-col">
                <label>Username</label>
                <input
                  name="username"
                  value={technicianLogin.username}
                  onChange={handleTechnicianLoginChange}
                  placeholder="tech1"
                  required
                />
              </div>
              <div className="form-col">
                <label>Password</label>
                <input
                  type="password"
                  name="password"
                  value={technicianLogin.password}
                  onChange={handleTechnicianLoginChange}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="login-actions">
                <button className="btn-primary" type="submit">
                  Login as Technician
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setView("landing");
                    setLoginError("");
                  }}
                >
                  Back to home
                </button>
              </div>

              {loginError && <div className="login-error">{loginError}</div>}
            </form>
          </div>
        )}

        {/* ADMIN LOGIN */}
        {view === "adminLogin" && (
          <div className="card login-card">
            <div className="login-title">Admin Login</div>
            <div className="login-subtitle">
              Demo credentials – Username: <b>admin</b>, Password:{" "}
              <b>admin123</b>
            </div>

            <form onSubmit={handleAdminLoginSubmit}>
              <div className="form-col">
                <label>Username</label>
                <input
                  name="username"
                  value={adminLogin.username}
                  onChange={handleAdminLoginChange}
                  placeholder="admin"
                  required
                />
              </div>
              <div className="form-col">
                <label>Password</label>
                <input
                  type="password"
                  name="password"
                  value={adminLogin.password}
                  onChange={handleAdminLoginChange}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div className="login-actions">
                <button className="btn-primary" type="submit">
                  Login as Admin
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setView("landing");
                    setLoginError("");
                  }}
                >
                  Back to home
                </button>
              </div>

              {loginError && <div className="login-error">{loginError}</div>}
            </form>
          </div>
        )}

        {/* STUDENT DASHBOARD */}
        {view === "studentDashboard" && (
          <>
            <div className="card">
              <div className="card-title">Raise a New Complaint</div>
              <div className="card-subtitle">
                Choose the issue category and describe the problem. Priority is
                auto-detected at the backend from your description.
              </div>

              <div className="issue-chips">
                {issuePresets.map((preset) => (
                  <button
                    key={preset.category}
                    type="button"
                    className={
                      "issue-chip" +
                      (form.category === preset.category ? " active" : "")
                    }
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        category: preset.category,
                      }))
                    }
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmitComplaint}>
                <div className="form-row">
                  <div className="form-col">
                    <label>Your Name</label>
                    <input
                      name="reporterName"
                      value={form.reporterName}
                      onChange={handleComplaintChange}
                      placeholder="e.g., Lalith C"
                      required
                    />
                  </div>
                  <div className="form-col">
                    <label>Your Email</label>
                    <input
                      type="email"
                      name="reporterEmail"
                      value={form.reporterEmail}
                      onChange={handleComplaintChange}
                      placeholder="you@bmsit.in"
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-col">
                    <label>Issue Title</label>
                    <input
                      name="title"
                      value={form.title}
                      onChange={handleComplaintChange}
                      placeholder="Water leakage near washroom"
                      required
                    />
                  </div>
                  <div className="form-col">
                    <label>Category</label>
                    <select
                      name="category"
                      value={form.category}
                      onChange={handleComplaintChange}
                    >
                      <option value="water">Water</option>
                      <option value="electricity">Electricity</option>
                      <option value="internet">Internet</option>
                      <option value="garbage">Garbage</option>
                      <option value="hostel">Hostel</option>
                      <option value="it">IT</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-col">
                    <label>Description</label>
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={handleComplaintChange}
                      placeholder="Explain what is happening, where, and how severe it is."
                      required
                    />
                  </div>
                  <div className="form-col">
                    <label>Image URL (optional)</label>
                    <input
                      name="imageUrl"
                      value={form.imageUrl}
                      onChange={handleComplaintChange}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-col">
                    <label>Building / Block</label>
                    <input
                      name="building"
                      value={form.building}
                      onChange={handleComplaintChange}
                      placeholder="Hostel A / CS Block / Library..."
                      required
                    />
                  </div>
                  <div className="form-col">
                    <label>Room / Floor</label>
                    <input
                      name="room"
                      value={form.room}
                      onChange={handleComplaintChange}
                      placeholder="Room 207, 2nd Floor"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-col">
                    <label>Latitude (optional)</label>
                    <input
                      name="lat"
                      value={form.lat}
                      onChange={handleComplaintChange}
                      placeholder="12.99"
                    />
                  </div>
                  <div className="form-col">
                    <label>Longitude (optional)</label>
                    <input
                      name="lng"
                      value={form.lng}
                      onChange={handleComplaintChange}
                      placeholder="77.59"
                    />
                  </div>
                </div>

                <button
                  className="btn-primary"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "Submitting..." : "Submit Complaint"}
                </button>

                {msg.text && (
                  <div
                    className={
                      "message " +
                      (msg.type === "error" ? "error" : "success")
                    }
                  >
                    {msg.text}
                  </div>
                )}
              </form>
            </div>

            <div className="card">
              <div className="card-title">Recent Complaints</div>
              <div className="card-subtitle">
                Latest incidents with status and backend-generated priority.
              </div>

              {incidents.length === 0 ? (
                <div style={{ fontSize: 13 }}>
                  No complaints yet or backend not connected.
                </div>
              ) : (
                <table className="incidents-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Building</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Reporter</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc) => (
                      <tr key={inc._id}>
                        <td>{inc.title}</td>
                        <td>{inc.category}</td>
                        <td>{inc.location?.building}</td>
                        <td>{statusBadge(inc.status)}</td>
                        <td>{priorityBadge(inc.priority)}</td>
                        <td>{inc.createdBy?.name || "Unknown"}</td>
                        <td>{new Date(inc.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card">
              <div className="card-title">Prediction Alerts</div>
              <div className="card-subtitle">
                Frequency-based prediction from the backend (last 14 days).
              </div>

              {predictions.length === 0 ? (
                <div style={{ fontSize: 13 }}>No prediction alerts yet.</div>
              ) : (
                <div>
                  {predictions.map((p, idx) => (
                    <div className="prediction-item" key={idx}>
                      <strong>{p.building}</strong> – {p.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* TECHNICIAN DASHBOARD */}
        {view === "technicianDashboard" && technicianInfo && (
          <>
            {(() => {
              const tech = DUMMY_TECHNICIANS.find(
                (t) => t.id === technicianInfo.id
              );
              const stats = computeTechStats(technicianInfo.id);
              const myTasks = DUMMY_TASKS.filter(
                (t) => t.technicianId === technicianInfo.id
              );

              return (
                <div className="tech-grid">
                  <div className="card">
                    <div className="card-title">
                      My Assigned Tasks – {tech.displayName}
                    </div>
                    <div className="card-subtitle">
                      Example: Lift issue task already assigned to Technician 1;
                      another lift inspection is pending for Technician 2.
                    </div>

                    {myTasks.length === 0 ? (
                      <div style={{ fontSize: 13 }}>No tasks assigned.</div>
                    ) : (
                      <table className="incidents-table">
                        <thead>
                          <tr>
                            <th>Issue</th>
                            <th>Building</th>
                            <th>Status</th>
                            <th>Response (min)</th>
                            <th>Resolution (min)</th>
                            <th>SLA (min)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myTasks.map((t) => (
                            <tr key={t.id}>
                              <td>{t.title}</td>
                              <td>{t.building}</td>
                              <td>
                                {t.status === "pending" && (
                                  <span className="status-badge status-new">
                                    Pending
                                  </span>
                                )}
                                {t.status === "in_progress" && (
                                  <span className="status-badge status-in-progress">
                                    In Progress
                                  </span>
                                )}
                                {t.status === "resolved" && (
                                  <span className="status-badge status-resolved">
                                    Resolved
                                  </span>
                                )}
                              </td>
                              <td>
                                {typeof t.responseMinutes === "number"
                                  ? t.responseMinutes
                                  : "-"}
                              </td>
                              <td>
                                {typeof t.resolutionMinutes === "number"
                                  ? t.resolutionMinutes
                                  : "-"}
                              </td>
                              <td>{t.slaMinutes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="card">
                    <div className="card-title">My Performance Score</div>
                    <div className="card-subtitle">
                      Score based on how quickly you react, resolve and how
                      many issues you close.
                    </div>

                    <div className="tech-metrics">
                      <div className="tech-metric">
                        <div className="tech-metric-label">Total Tickets</div>
                        <div className="tech-metric-value">
                          {stats.total || 0}
                        </div>
                      </div>
                      <div className="tech-metric">
                        <div className="tech-metric-label">
                          Resolved Tickets
                        </div>
                        <div className="tech-metric-value">
                          {stats.resolvedCount || 0}
                        </div>
                      </div>
                      <div className="tech-metric">
                        <div className="tech-metric-label">
                          Pending / In Progress
                        </div>
                        <div className="tech-metric-value">
                          {stats.pending || 0}
                        </div>
                      </div>
                      <div className="tech-metric">
                        <div className="tech-metric-label">
                          Avg Response (min)
                        </div>
                        <div className="tech-metric-value">
                          {stats.responseAvg !== null
                            ? stats.responseAvg
                            : "-"}
                        </div>
                      </div>
                      <div className="tech-metric">
                        <div className="tech-metric-label">
                          Avg Resolution (min)
                        </div>
                        <div className="tech-metric-value">
                          {stats.resolutionAvg !== null
                            ? stats.resolutionAvg
                            : "-"}
                        </div>
                      </div>
                      <div className="tech-metric tech-metric-score">
                        <div className="tech-metric-label">Score</div>
                        <div className="tech-metric-value">
                          {stats.score || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ADMIN DASHBOARD */}
        {view === "adminDashboard" && (
          <>
            {(() => {
              const resolvedIssues = DUMMY_TASKS.filter(
                (t) => t.status === "resolved"
              ).length;
              const pendingIssues = DUMMY_TASKS.filter(
                (t) => t.status !== "resolved"
              ).length;

              return (
                <div className="admin-stats-row">
                  <div className="admin-stat-card resolved">
                    <div className="admin-stat-label">Problems Resolved</div>
                    <div className="admin-stat-value">{resolvedIssues}</div>
                    <div className="admin-stat-sub">
                      Tickets closed successfully by technicians.
                    </div>
                  </div>
                  <div className="admin-stat-card pending">
                    <div className="admin-stat-label">
                      Problems Pending / In Progress
                    </div>
                    <div className="admin-stat-value">{pendingIssues}</div>
                    <div className="admin-stat-sub">
                      Open lift issues, inspections and other tasks.
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Campus heatmap card (Leaflet map) */}
            <div className="card">
              <div className="card-title">Campus Issue Heatmap</div>
              <div className="card-subtitle">
                Live view of reported issues on the BMSIT campus map.
                Color-coded by category (e.g., red for internet, blue for
                water, yellow for electricity).
              </div>
              <CampusIssueMap incidents={incidents} />
            </div>

            {/* Full complaints table */}
            <div className="card">
              <div className="card-title">All Complaints (Admin View)</div>
              <div className="card-subtitle">
                Monitor all incidents across campus with their status and
                priority.
              </div>

              {incidents.length === 0 ? (
                <div style={{ fontSize: 13 }}>
                  No complaints yet or backend not connected.
                </div>
              ) : (
                <table className="incidents-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Building</th>
                      <th>Status</th>
                      <th>Priority</th>
                      <th>Reporter</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc) => (
                      <tr key={inc._id}>
                        <td>{inc.title}</td>
                        <td>{inc.category}</td>
                        <td>{inc.location?.building}</td>
                        <td>{statusBadge(inc.status)}</td>
                        <td>{priorityBadge(inc.priority)}</td>
                        <td>{inc.createdBy?.name || "Unknown"}</td>
                        <td>{new Date(inc.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Technician performance summary */}
            <div className="card">
              <div className="card-title">Technician Performance Overview</div>
              <div className="card-subtitle">
                Dummy data: Lift issue currently in progress for Technician 1;
                another lift inspection pending for Technician 2.
              </div>

              <table className="incidents-table">
                <thead>
                  <tr>
                    <th>Technician</th>
                    <th>Specialization</th>
                    <th>Total</th>
                    <th>Resolved</th>
                    <th>Pending</th>
                    <th>Avg Response (min)</th>
                    <th>Avg Resolution (min)</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {DUMMY_TECHNICIANS.map((tech) => {
                    const s = computeTechStats(tech.id);
                    return (
                      <tr key={tech.id}>
                        <td>{tech.displayName}</td>
                        <td>{tech.specialization}</td>
                        <td>{s.total}</td>
                        <td>{s.resolvedCount}</td>
                        <td>{s.pending}</td>
                        <td>{s.responseAvg !== null ? s.responseAvg : "-"}</td>
                        <td>
                          {s.resolutionAvg !== null ? s.resolutionAvg : "-"}
                        </td>
                        <td>{s.score}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Prediction alerts */}
            <div className="card">
              <div className="card-title">Prediction Alerts</div>
              <div className="card-subtitle">
                High-risk buildings and categories based on recent incident
                patterns.
              </div>

              {predictions.length === 0 ? (
                <div style={{ fontSize: 13 }}>
                  No prediction alerts yet. Once backend and data are ready,
                  alerts will appear here.
                </div>
              ) : (
                <div>
                  {predictions.map((p, idx) => (
                    <div className="prediction-item" key={idx}>
                      <strong>{p.building}</strong> – {p.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
