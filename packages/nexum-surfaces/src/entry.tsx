import { render } from "solid-js/web"
import { NexumSurfaces } from "./main"
import "./styles.css"
import "@nexum/chat-surface/styles.css"

const root = document.getElementById("root")
if (!root) throw new Error("Nexum UI root element is missing")
render(() => <NexumSurfaces />, root)
