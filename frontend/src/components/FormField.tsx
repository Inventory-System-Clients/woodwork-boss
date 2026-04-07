import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";

interface FormFieldBaseProps {
  label: string;
  error?: string;
}

interface FormInputProps extends FormFieldBaseProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  as?: "input";
}

interface FormSelectProps extends FormFieldBaseProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  as: "select";
  options: { value: string; label: string }[];
}

interface FormTextareaProps extends FormFieldBaseProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  as: "textarea";
}

type FormFieldProps = FormInputProps | FormSelectProps | FormTextareaProps;

export function FormField(props: FormFieldProps) {
  const { t } = useLanguage();
  const { label, error } = props;
  const baseClass = "w-full px-3 py-2 bg-secondary/50 border border-border rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors";

  if (props.as === "select") {
    const { label: _l, error: _e, as: _a, options, ...selectProps } = props;
    return (
      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t(label)}</label>
        <select className={baseClass} {...selectProps}>
          <option value="">{t("Selecione...")}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{t(o.label)}</option>
          ))}
        </select>
        {error && <p className="text-xs text-destructive">{t(error)}</p>}
      </div>
    );
  }

  if (props.as === "textarea") {
    const { label: _l, error: _e, as: _a, ...textareaProps } = props;
    return (
      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t(label)}</label>
        <textarea
          className={`${baseClass} min-h-[80px]`}
          {...textareaProps}
          placeholder={typeof textareaProps.placeholder === "string" ? t(textareaProps.placeholder) : textareaProps.placeholder}
        />
        {error && <p className="text-xs text-destructive">{t(error)}</p>}
      </div>
    );
  }

  const { label: _l, error: _e, as: _a, ...inputProps } = props;
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{t(label)}</label>
      <input
        className={baseClass}
        {...inputProps}
        placeholder={typeof inputProps.placeholder === "string" ? t(inputProps.placeholder) : inputProps.placeholder}
      />
      {error && <p className="text-xs text-destructive">{t(error)}</p>}
    </div>
  );
}
