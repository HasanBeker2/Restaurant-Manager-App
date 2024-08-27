import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home as HomeIcon, PlusSquare, Folder, User } from "lucide-react";

const BottomTabBar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleCreateNote = () => {
    navigate("/new-note");
  };

  return (
    <nav className="bottom-nav bg-sky-600 text-white p-4 flex justify-around items-center fixed bottom-0 left-0 right-0">
      <Link
        to="/"
        className={`text-2xl ${location.pathname === "/" ? "text-sky-200" : ""}`}
      >
        <HomeIcon size={24} />
      </Link>
      <button
        onClick={handleCreateNote}
        className={`text-2xl ${location.pathname === "/new-note" ? "text-sky-200" : ""}`}
      >
        <PlusSquare size={24} />
      </button>
      <Link
        to="/folders"
        className={`text-2xl ${location.pathname === "/folders" ? "text-sky-200" : ""}`}
      >
        <Folder size={24} />
      </Link>
      <Link
        to="/profile"
        className={`text-2xl ${location.pathname === "/profile" ? "text-sky-200" : ""}`}
      >
        <User size={24} />
      </Link>
    </nav>
  );
};

export default BottomTabBar;