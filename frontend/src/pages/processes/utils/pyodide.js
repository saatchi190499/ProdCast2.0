let __pyodidePromise = null;

export async function loadPyodideOnce(setStatus) {
  if (window.__pyodide) return window.__pyodide;
  if (__pyodidePromise) {
    setStatus && setStatus("loading");
    const py = await __pyodidePromise;
    setStatus && setStatus("ready");
    return py;
  }

  setStatus && setStatus("loading");

  __pyodidePromise = new Promise((resolve, reject) => {
    const SRC = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js";
    let tag = document.getElementById("pyodide-script");

    const finish = async () => {
      for (let i = 0; i < 80; i++) {
        if (typeof globalThis.loadPyodide === "function") break;
        await new Promise((r) => setTimeout(r, 50));
      }
      try {
        const py = await globalThis.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/" });
        window.__pyodide = py;
        resolve(py);
      } catch (e) { reject(e); }
    };

    if (!tag) {
      tag = document.createElement("script");
      tag.id = "pyodide-script";
      tag.src = SRC;
      tag.async = true;
      tag.onload = finish;
      tag.onerror = () => reject(new Error("Failed to load Pyodide script"));
      document.body.appendChild(tag);
    } else {
      tag.addEventListener("load", finish, { once: true });
      tag.addEventListener("error", () => reject(new Error("Failed to load Pyodide script")), { once: true });
    }
  });

  return __pyodidePromise;
}
