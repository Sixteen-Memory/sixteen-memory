import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./product-page.css";
import "./site-document.css";
import "./developer-menu.css";

const root = document.getElementById("root")!;
const app = <React.StrictMode><App /></React.StrictMode>;
if (root.hasChildNodes() && new URLSearchParams(window.location.search).get("lang") !== "en") {
  ReactDOM.hydrateRoot(root, app);
} else {
  ReactDOM.createRoot(root).render(app);
}
