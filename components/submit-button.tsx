"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  confirmMessage?: string;
};

export function SubmitButton({
  children,
  pendingText = "Saving...",
  className = "btn",
  name,
  value,
  disabled,
  confirmMessage,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      name={name}
      value={value}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending && <span className="button-spinner" aria-hidden="true" />}
      {pending ? pendingText : children}
    </button>
  );
}
