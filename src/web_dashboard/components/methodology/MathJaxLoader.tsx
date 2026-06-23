"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: () => Promise<void>;
      startup?: { promise?: Promise<void> };
      [key: string]: unknown;
    };
  }
}

const MATHJAX_SCRIPT_ID = "mathjax-tex-svg";

export function MathJaxLoader() {
  useEffect(() => {
    const typeSet = () => {
      const runner = window.MathJax?.typesetPromise;
      if (typeof runner === "function") {
        void runner();
      }
    };

    if (window.MathJax?.typesetPromise) {
      typeSet();
      return;
    }

    (window as Window & { MathJax: unknown }).MathJax = {
      tex: {
        inlineMath: [
          ["\\(", "\\)"],
          ["$", "$"],
        ],
        displayMath: [
          ["\\[", "\\]"],
          ["$$", "$$"],
        ],
      },
      svg: { fontCache: "global" },
      options: {
        renderActions: {
          addMenu: [],
        },
      },
    };

    let script = document.getElementById(MATHJAX_SCRIPT_ID) as
      | HTMLScriptElement
      | null;
    if (!script) {
      script = document.createElement("script");
      script.id = MATHJAX_SCRIPT_ID;
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
      script.async = true;
      script.onload = typeSet;
      document.head.appendChild(script);
    } else {
      typeSet();
    }
  }, []);

  return null;
}

