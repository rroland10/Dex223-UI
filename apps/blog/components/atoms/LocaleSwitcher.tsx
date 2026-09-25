"use client";

import clsx from "clsx";
import Image from "next/image";
import { useLocale } from "next-intl";
import { useState } from "react";

import Popover from "@/components/atoms/Popover";
import SelectButton from "@/components/atoms/SelectButton";
import SelectOption from "@/components/atoms/SelectOption";
import { locales, usePathname, useRouter } from "@/i18n/routing";

const localesMap: {
  [key: string]: {
    img?: string;
    label: string;
    symbol: string;
  };
} = {
  en: {
    img: "/images/locales/en.svg",
    label: "English",
    symbol: "En",
  },
  es: {
    img: "/images/locales/es.svg",
    label: "Español",
    symbol: "Es",
  },
  zh: {
    img: "/images/locales/zh.svg",
    // Was 中国人, which means "Chinese person" rather than the language.
    label: "中文",
    symbol: "Zh",
  },
  ko: {
    img: "/images/locales/ko.svg",
    label: "한국어",
    symbol: "Ko",
  },
  fr: {
    img: "/images/locales/fr.svg",
    label: "Français",
    symbol: "Fr",
  },
  pt: {
    img: "/images/locales/pt.svg",
    label: "Português",
    symbol: "Pt",
  },
  ru: {
    img: "/images/locales/ru.svg",
    label: "Русский",
    symbol: "Ru",
  },
};
export default function LocaleSwitcher({ isMobile = false }: { isMobile?: boolean }) {
  const lang = useLocale();
  const pathName = usePathname();
  const router = useRouter();

  const [isOpened, setIsOpened] = useState(false);

  const redirectedPathName = (locale: string) => {
    router.replace(pathName, { locale: locale as any });
  };

  return (
    <div className={clsx(!isMobile && "hidden xl:block", "flex-shrink-0")}>
      <Popover
        isOpened={isOpened}
        setIsOpened={setIsOpened}
        placement={isMobile ? "top-start" : "bottom-start"}
        trigger={
          <SelectButton
            className={clsx("px-3 text-secondary-text", isMobile && "bg-tertiary-bg")}
            isOpen={isOpened}
            onClick={() => setIsOpened(!isOpened)}
          >
            {localesMap[lang]?.symbol || localesMap["en"]?.symbol}
          </SelectButton>
        }
      >
        <div className="py-1 bg-primary-bg rounded-2 shadow-popover shadow-black/70">
          <ul>
            {locales.map((locale) => {
              return (
                <li className="min-w-[200px]" key={locale}>
                  <SelectOption
                    onClick={() => redirectedPathName(locale)}
                    isActive={lang === locale}
                  >
                    {localesMap[locale]?.img ? (
                      <Image
                        src={localesMap[locale].img as string}
                        alt={localesMap[locale].label}
                        width={24}
                        height={24}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="w-6 h-6 flex items-center justify-center rounded-1 bg-tertiary-bg text-12 text-secondary-text"
                      >
                        {localesMap[locale]?.symbol}
                      </span>
                    )}
                    {localesMap[locale]?.label} ({localesMap[locale]?.symbol})
                  </SelectOption>
                </li>
              );
            })}
          </ul>
        </div>
      </Popover>
    </div>
  );
}
