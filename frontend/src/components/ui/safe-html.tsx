import * as React from "react";
import { formatMarkdown } from "@/lib/markdown";

interface SafeHtmlProps extends React.HTMLAttributes<HTMLDivElement> {
  text: string;
  variant?: "tutor" | "teacher";
  as?: "div" | "span" | "p";
}

export const SafeHtml = React.forwardRef<HTMLDivElement, SafeHtmlProps>(
  ({ text, variant = "teacher", as = "div", className, ...props }, ref) => {
    const html = React.useMemo(() => formatMarkdown(text, variant), [text, variant]);
    const Component = as as any;
    return (
      <Component
        ref={ref}
        className={className}
        dangerouslySetInnerHTML={{ __html: html }}
        {...props}
      />
    );
  }
);

SafeHtml.displayName = "SafeHtml";
