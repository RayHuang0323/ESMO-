import React from "react";
import GameView from "./GameView.jsx";

export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "#0d1420", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 1100 }}>
        <GameView />
      </div>
    </div>
  );
}
