/**
 * Formats mathematical LaTeX expressions, exponents, subscripts,
 * and basic markdown formatting (bold, italic) into HTML safe text.
 */
export const formatMarkdown = (text: string, variant: "tutor" | "teacher" = "teacher"): string => {
  if (!text) return "";
  let html = text;

  // Escape HTML tags to prevent basic XSS
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Format bold-italic (***text***)
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Format bold (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Format italic (*text*)
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  const cleanMathSymbols = (str: string) => {
    let m = str;
    
    // Strip left/right modifiers
    m = m.replace(/\\left/g, "").replace(/\\right/g, "");
    
    // Replace latex spaces with normal space
    m = m.replace(/\\,/g, " ")
         .replace(/\\ /g, " ")
         .replace(/\\;/g, " ")
         .replace(/\\:/g, " ")
         .replace(/\\!/g, "");

    // Replace fractions using inline-styles to avoid spacing/line-height gaps
    m = m.replace(/\\d?frac\{([^}]+)\}\{([^}]+)\}/g, (_match, num, den) => {
      const borderCol = variant === "tutor" ? "#4f46e5" : "#7c3aed"; // indigo vs purple border
      return `<span style="display: inline-flex; flex-direction: column; align-items: center; line-height: 1 !important; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; margin: 0 4px; vertical-align: middle;">
        <span style="display: block; width: 100%; text-align: center; border-bottom: 1px solid ${borderCol}; padding-bottom: 2px; line-height: 1 !important;">${num}</span>
        <span style="display: block; width: 100%; text-align: center; padding-top: 2px; line-height: 1 !important;">${den}</span>
      </span>`;
    });

    m = m.replace(/\\cdot/g, "·");
    m = m.replace(/\\neq/g, "≠");
    m = m.replace(/\\Rightarrow|\\implies/g, "⇒");
    m = m.replace(/\\le|\\leq/g, "≤");
    m = m.replace(/\\ge|\\geq/g, "≥");
    m = m.replace(/\\times/g, "×");
    m = m.replace(/\\div/g, "÷");
    m = m.replace(/\\in/g, "∈");
    m = m.replace(/\\pm/g, "±");

    // Blackboard bold sets
    m = m.replace(/\\mathbb\{Z\}/g, "ℤ");
    m = m.replace(/\\mathbb\{R\}/g, "ℝ");
    m = m.replace(/\\mathbb\{N\}/g, "ℕ");
    m = m.replace(/\\mathbb\{Q\}/g, "ℚ");
    m = m.replace(/\\mathbb\{C\}/g, "ℂ");

    // Replace exponents (superscripts)
    m = m.replace(/\^\{(.*?)\}/g, "<sup>$1</sup>");
    m = m.replace(/\^([a-zA-Z0-9\-+])/g, "<sup>$1</sup>");

    // Replace subscripts
    m = m.replace(/_\{(.*?)\}/g, "<sub>$1</sub>");
    m = m.replace(/_([a-zA-Z0-9\-+])/g, "<sub>$1</sub>");

    return m;
  };

  // 1. First: Replace LaTeX formulas wrapped in $...$
  html = html.replace(/\$(.*?)\$/g, (_match, p1) => {
    const cleaned = cleanMathSymbols(p1);
    if (variant === "tutor") {
      return `<span class="font-mono bg-indigo-50/70 text-indigo-900 px-1.5 py-0.5 rounded text-[12px] font-bold border border-indigo-200/60 mx-0.5 inline-flex items-center">${cleaned}</span>`;
    } else {
      return `<span class="font-serif italic text-slate-800 mx-0.5 inline-flex items-center align-middle">${cleaned}</span>`;
    }
  });

  // 2. Second: Clean up any raw LaTeX commands outside of $...$ (e.g. raw \in, \neq, \mathbb{Z})
  html = cleanMathSymbols(html);

  html = html.replace(/\n/g, "<br />");
  return html;
};
