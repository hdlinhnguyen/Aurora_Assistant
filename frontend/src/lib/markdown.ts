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
    m = m.replace(/\\approx/g, "≈");
    m = m.replace(/\\sim/g, "∼");
    m = m.replace(/\\parallel/g, "∥");
    m = m.replace(/\\perp/g, "⊥");
    m = m.replace(/\\angle/g, "∠");
    m = m.replace(/\\infty/g, "∞");
    m = m.replace(/\\pi/g, "π");
    m = m.replace(/\\sqrt\{([^}]+)\}/g, "√($1)");
    m = m.replace(/\\overline\{([^}]+)\}/g, "<span style=\"text-decoration: overline;\">$1</span>");
    m = m.replace(/\\vec\{([^}]+)\}/g, "<span style=\"text-decoration: overline;\">$1</span>");

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

  const inlineMath = (value: string) => {
    const cleaned = cleanMathSymbols(value);
    if (variant === "tutor") {
      return `<span class="font-mono bg-indigo-50/70 text-indigo-900 px-1.5 py-0.5 rounded text-[12px] font-bold border border-indigo-200/60 mx-0.5 inline-flex items-center">${cleaned}</span>`;
    }
    return `<span class="font-serif italic text-slate-800 mx-0.5 inline-flex items-center align-middle">${cleaned}</span>`;
  };

  const blockMath = (value: string) => {
    const cleaned = cleanMathSymbols(value);
    if (variant === "tutor") {
      return `<div class="my-2 rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-3 py-2 text-center font-mono text-[13px] font-bold text-indigo-950">${cleaned}</div>`;
    }
    return `<div class="my-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center font-serif italic text-slate-800">${cleaned}</div>`;
  };

  // 1. First: Replace LaTeX formulas in common wrappers.
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_match, p1) => blockMath(p1));
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_match, p1) => blockMath(p1));
  html = html.replace(/\\\(([\s\S]*?)\\\)/g, (_match, p1) => inlineMath(p1));
  html = html.replace(/\$(?!\s)([^$\n]+?)\$/g, (_match, p1) => inlineMath(p1));

  // 2. Second: Clean up any raw LaTeX commands outside of $...$ (e.g. raw \in, \neq, \mathbb{Z})
  html = cleanMathSymbols(html);

  html = html.replace(/\n/g, "<br />");
  return html;
};
