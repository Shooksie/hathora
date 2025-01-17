import React from "react";
import ReactDOM from "react-dom/client";
import HathuraContextProvider from "./context/GameContext";

import App from "./App";
import "./index.css";
import "react-toastify/dist/ReactToastify.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <HathuraContextProvider>
    <App />
  </HathuraContextProvider>
);
