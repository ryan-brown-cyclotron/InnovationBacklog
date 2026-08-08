import { useEffect } from "react";

export function useReveal(deps: unknown[]): void {
  useEffect(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    let observer: IntersectionObserver | undefined;

    const revealVisible = () => {
      elements.forEach((element) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.top >= window.innerHeight - 48 || bounds.bottom <= 0) return;
        element.classList.remove("reveal-pending");
        element.classList.add("is-visible");
        observer?.unobserve(element);
      });
    };

    elements.forEach((element, index) => {
      element.style.setProperty(
        "--reveal-delay",
        `${Math.min(index * 45, 180)}ms`,
      );
    });

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.remove("reveal-pending");
            entry.target.classList.add("is-visible");
            observer?.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -48px", threshold: 0.12 },
      );
      elements.forEach((element) => {
        if (
          !element.classList.contains("is-visible") &&
          element.getBoundingClientRect().top >= window.innerHeight - 48
        )
          element.classList.add("reveal-pending");
        observer?.observe(element);
      });
    }

    revealVisible();
    window.addEventListener("scroll", revealVisible, { passive: true });
    return () => {
      window.removeEventListener("scroll", revealVisible);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
