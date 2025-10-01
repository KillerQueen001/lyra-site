import "./App.css";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// Route'lar
import CastSelect from "./routes/CastSelect";
import CastEditor from "./routes/CastEditor";
import Watch from "./routes/Watch";

// Sayfalar
import Home from "./pages/Home";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import Videos from "./pages/Videos";
import VideoDetail from "./pages/VideoDetail";
import Cast from "./pages/Cast";
import CastDetail from "./pages/CastDetail";
import Apply from "./pages/Apply";
import Contact from "./pages/Contact";
import ContentDetail from "./pages/ContentDetail";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import VideoEditor from "./pages/VideoEditor";
import AdminTimeline from "./pages/AdminTimeline";


// Navbar component
function Navbar() {
  return (
    <nav className="navbar">
      <div className="logo-area">
        <img src="/lyra_logo.png" alt="Lyra Logo" className="nav-logo-icon" />
        <div className="logo-text">Lyra Records</div>
      </div>

      <ul className="nav-links">
        <li><a href="/groups">Gruplar</a></li>
        <li><a href="/videos">Videolar</a></li>
        <li><a href="/cast">Cast</a></li>
        <li><a href="/apply">Başvuru</a></li>
        <li><a href="/contact">İletişim</a></li>
        <li><a href="/profile">Profil</a></li>
        <li><a href="/admin">Admin</a></li>
      </ul>
    </nav>
  );
}

export default function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/groups" element={<Groups />} />
        <Route path="/groups/:slug" element={<GroupDetail />} />
        <Route path="/videos" element={<Videos />} />
        <Route path="/videos/:id" element={<VideoDetail />} />
        <Route path="/cast" element={<Cast />} />
        <Route path="/cast/:username" element={<CastDetail />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/content/:id" element={<ContentDetail />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/" element={<Home />} />
        <Route path="/watch/:id" element={<Watch />} />
        <Route path="/admin/video-editor" element={<VideoEditor />} />
        <Route path="/admin/timeline" element={<AdminTimeline />} />
      </Routes>
    </Router>
  );
}
