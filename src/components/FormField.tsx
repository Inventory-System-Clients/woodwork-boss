import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface BaseProps {
  label: string;
  error?: string;
}

type InputProps = BaseProps & InputHTMLAttributes<HTMLInputElement> & { as?: "input" };
type SelectProps = BaseProps & SelectHTMLAttributes<HTMLSelectElement> & { as: "select"; options: { value: string; label: string }[] };
type TextareaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { as: "textarea" };

type FormFieldProps = InputProps | SelectProps | TextareaProps;

export function FormField(props: FormFieldProps) {
  const { label, error } = props;
  const baseClass = "w-full px-3 py-2 bg-secondary/50 border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors";

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</label>
      {props.as === "select" ? (
        <select className={baseClass} {...(({ label: _, error: _, as: _, options: _, ...rest }) => rest)(props)}>
          <option value="">Select...</option>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : props.as === "textarea" ? (
        <textarea className={`${baseClass} min-h-[80px]`} {...(({ label: _, error: _, as: _, ...rest }) => rest)(props)} />
      ) : (
        <input className={baseClass} {...(({ label: _, error: _, as: _, ...rest }) => rest)(props)} />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
