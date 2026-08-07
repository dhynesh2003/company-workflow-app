"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  FormHTMLAttributes,
} from "react";

type DraftFormProps =
  FormHTMLAttributes<HTMLFormElement> & {
    storageKey: string;
    statusLabel?: string;
  };

type SavedDraftValue =
  | string
  | string[];

type SavedDraft = Record<
  string,
  SavedDraftValue
>;

export function DraftForm({
  storageKey,
  statusLabel = "Draft",
  children,
  ...props
}: DraftFormProps) {
  const formRef =
    useRef<HTMLFormElement>(null);

  const [status, setStatus] = useState(
    "Draft protection active"
  );

  useEffect(() => {
    const form = formRef.current;

    if (!form) {
      return;
    }

    let saveTimer:
      | ReturnType<typeof setTimeout>
      | undefined;

    let restoreFrame:
      | number
      | undefined;

    const saved =
      window.localStorage.getItem(
        storageKey
      );

    if (saved) {
      try {
        const values =
          JSON.parse(saved) as SavedDraft;

        Object.entries(values).forEach(
          ([name, value]) => {
            const selector =
              `[name="${CSS.escape(
                name
              )}"]`;

            const fields =
              form.querySelectorAll<
                | HTMLInputElement
                | HTMLTextAreaElement
                | HTMLSelectElement
              >(selector);

            fields.forEach(
              (field, index) => {
                const nextValue =
                  Array.isArray(value)
                    ? value[index]
                    : value;

                if (
                  typeof nextValue ===
                    "string" &&
                  !field.value
                ) {
                  field.value =
                    nextValue;
                }
              }
            );
          }
        );

        // Updating in the animation callback
        // avoids synchronous setState inside
        // the effect body.
        restoreFrame =
          window.requestAnimationFrame(
            () => {
              setStatus(
                "Local draft restored"
              );
            }
          );
      } catch {
        window.localStorage.removeItem(
          storageKey
        );
      }
    }

    const saveDraft = () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
      }

      saveTimer = setTimeout(() => {
        const formData =
          new FormData(form);

        const payload: SavedDraft = {};

        for (const [
          key,
          rawValue,
        ] of formData.entries()) {
          if (
            rawValue instanceof File
          ) {
            continue;
          }

          const value =
            String(rawValue);

          const existingValue =
            payload[key];

          if (
            existingValue === undefined
          ) {
            payload[key] = value;
          } else if (
            Array.isArray(existingValue)
          ) {
            payload[key] = [
              ...existingValue,
              value,
            ];
          } else {
            payload[key] = [
              existingValue,
              value,
            ];
          }
        }

        window.localStorage.setItem(
          storageKey,
          JSON.stringify(payload)
        );

        const savedTime =
          new Date().toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit",
            }
          );

        setStatus(
          `Saved locally at ${savedTime}`
        );
      }, 500);
    };

    const clearDraft = () => {
      window.localStorage.removeItem(
        storageKey
      );
    };

    form.addEventListener(
      "input",
      saveDraft
    );

    form.addEventListener(
      "change",
      saveDraft
    );

    form.addEventListener(
      "submit",
      clearDraft
    );

    return () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
      }

      if (
        restoreFrame !== undefined
      ) {
        window.cancelAnimationFrame(
          restoreFrame
        );
      }

      form.removeEventListener(
        "input",
        saveDraft
      );

      form.removeEventListener(
        "change",
        saveDraft
      );

      form.removeEventListener(
        "submit",
        clearDraft
      );
    };
  }, [storageKey]);

  return (
    <form ref={formRef} {...props}>
      <div
        className="draft-status"
        role="status"
      >
        <span
          className="draft-dot"
          aria-hidden="true"
        />

        <strong>
          {statusLabel}:
        </strong>{" "}
        {status}
      </div>

      {children}
    </form>
  );
}