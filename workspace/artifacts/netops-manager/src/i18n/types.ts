export type Locale = "pt-BR" | "en";

export type TranslationValue = string | TranslationDict;

export interface TranslationDict {
  [key: string]: TranslationValue;
}

export type TranslationParams = Record<string, string | number>;
