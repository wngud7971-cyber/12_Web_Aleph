(() => {
  "use strict";

  // 모바일 메뉴
  const nav = document.querySelector(".nav");
  const menuButton = document.querySelector(".menu-button");
  const menuSymbol = menuButton.querySelector("span");
  const navLinks = [...nav.querySelectorAll("a")];

  const mobileBreakpoint = window.matchMedia("(max-width: 760px)");
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  const closeMenu = () => {
    nav.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuSymbol.textContent = "＋";
  };

  menuButton.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");

    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuSymbol.textContent = isOpen ? "−" : "＋";
  });

  navLinks.forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      nav.classList.contains("is-open")
    ) {
      closeMenu();
      menuButton.focus();
    }
  });

  mobileBreakpoint.addEventListener("change", closeMenu);

  // JavaScript가 없어도 본문이 보이도록,
  // 동작 가능할 때만 효과를 추가합니다.
  let revealObserver;

  if (
    "IntersectionObserver" in window &&
    !reducedMotion.matches
  ) {
    revealObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );

    document.querySelectorAll(".reveal").forEach(element => {
      if (element.getBoundingClientRect().top > window.innerHeight) {
        element.classList.add("will-reveal");
        revealObserver.observe(element);
      }
    });
  }

  reducedMotion.addEventListener("change", event => {
    if (event.matches) {
      document.querySelectorAll(".will-reveal").forEach(element => {
        element.classList.add("is-visible");
      });

      revealObserver?.disconnect();
    }
  });

  // 읽은 위치를 상단의 얇은 선으로 표시합니다.
  const progressBar = document.querySelector(".reading-progress");
  let frameRequested = false;

  const updateProgress = () => {
    const distance =
      document.documentElement.scrollHeight - window.innerHeight;

    const progress = distance > 0
      ? Math.max(0, Math.min(1, window.scrollY / distance))
      : 0;

    progressBar.style.transform = `scaleX(${progress})`;
    frameRequested = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (!frameRequested) {
        frameRequested = true;
        window.requestAnimationFrame(updateProgress);
      }
    },
    { passive: true }
  );

  window.addEventListener("resize", updateProgress);
  window.addEventListener("load", updateProgress);

  document.fonts?.ready.then(updateProgress);
  updateProgress();

  // 현재 읽는 구간의 메뉴를 강조합니다.
  if ("IntersectionObserver" in window) {
    const sections = [
      ...document.querySelectorAll("main > section[id]")
    ];

    const visibleSections = new Set();

    const sectionObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target);
          } else {
            visibleSections.delete(entry.target);
          }
        });

        const current = sections.find(section => {
          return visibleSections.has(section);
        });

        navLinks.forEach(link => {
          if (
            current &&
            link.getAttribute("href") === `#${current.id}`
          ) {
            link.setAttribute("aria-current", "location");
          } else {
            link.removeAttribute("aria-current");
          }
        });
      },
      {
        rootMargin: "-15% 0px -35% 0px",
        threshold: 0
      }
    );

    sections.forEach(section => {
      sectionObserver.observe(section);
    });
  }
})();
