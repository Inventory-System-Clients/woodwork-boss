import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppLanguage, reverseTranslateText, translateText } from "@/i18n/translations";

interface LanguageContextValue {
  language: AppLanguage;
  isItalian: boolean;
  setLanguage: (language: AppLanguage) => void;
  t: (value: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguage] = useState<AppLanguage>("pt-BR");
  const textOriginalsRef = useRef<WeakMap<Text, string>>(new WeakMap());
  const attrOriginalsRef = useRef<WeakMap<Element, Record<string, string>>>(new WeakMap());
  const isApplyingRef = useRef(false);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.body;
    const translatableAttrs = ["placeholder", "title", "aria-label"];

    const applyToTextNode = (node: Text) => {
      const current = node.nodeValue || "";
      if (!current.trim()) {
        return;
      }

      if (!textOriginalsRef.current.has(node)) {
        textOriginalsRef.current.set(node, current);
      }

      const original = textOriginalsRef.current.get(node) || current;
      const nextValue = translateText(original, language);
      if (nextValue !== node.nodeValue) {
        node.nodeValue = nextValue;
      }
    };

    const applyToElementAttrs = (element: Element) => {
      if (!attrOriginalsRef.current.has(element)) {
        attrOriginalsRef.current.set(element, {});
      }

      const originals = attrOriginalsRef.current.get(element)!;

      translatableAttrs.forEach((attrName) => {
        const attrValue = element.getAttribute(attrName);
        if (!attrValue || !attrValue.trim()) {
          return;
        }

        if (!(attrName in originals)) {
          originals[attrName] = attrValue;
        }

        const nextValue = translateText(originals[attrName], language);
        if (nextValue !== attrValue) {
          element.setAttribute(attrName, nextValue);
        }
      });
    };

    const walkAndApply = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        applyToTextNode(node as Text);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      applyToElementAttrs(node as Element);
      node.childNodes.forEach((child) => walkAndApply(child));
    };

    const restoreNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const current = textNode.nodeValue || "";
        const original = textOriginalsRef.current.get(textNode);
        if (original && textNode.nodeValue !== original) {
          textNode.nodeValue = original;
          return;
        }

        if (current.trim()) {
          const reversed = reverseTranslateText(current);
          if (reversed !== current) {
            textNode.nodeValue = reversed;
          }
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const element = node as Element;
      const originals = attrOriginalsRef.current.get(element);
      if (originals) {
        translatableAttrs.forEach((attrName) => {
          const original = originals[attrName];
          const current = element.getAttribute(attrName) || "";
          if (original && current !== original) {
            element.setAttribute(attrName, original);
            return;
          }

          if (current.trim()) {
            const reversed = reverseTranslateText(current);
            if (reversed !== current) {
              element.setAttribute(attrName, reversed);
            }
          }
        });
      }

      node.childNodes.forEach((child) => restoreNode(child));
    };

    const applySafely = (callback: () => void) => {
      isApplyingRef.current = true;
      callback();
      isApplyingRef.current = false;
    };

    if (language === "it-IT") {
      document.documentElement.lang = "it";

      applySafely(() => {
        walkAndApply(root);
      });

      const observer = new MutationObserver((records) => {
        if (isApplyingRef.current) {
          return;
        }

        applySafely(() => {
          records.forEach((record) => {
            if (record.type === "characterData" && record.target.nodeType === Node.TEXT_NODE) {
              applyToTextNode(record.target as Text);
              return;
            }

            if (record.type === "attributes" && record.target.nodeType === Node.ELEMENT_NODE) {
              applyToElementAttrs(record.target as Element);
            }

            record.addedNodes.forEach((node) => walkAndApply(node));
          });
        });
      });

      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: translatableAttrs,
      });

      return () => observer.disconnect();
    }

    document.documentElement.lang = "pt-BR";
    applySafely(() => {
      restoreNode(root);
    });

    const timeoutId = window.setTimeout(() => {
      applySafely(() => {
        restoreNode(root);
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      isItalian: language === "it-IT",
      setLanguage,
      t: (text: string) => translateText(text, language),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage deve ser usado dentro de LanguageProvider.");
  }

  return context;
};
