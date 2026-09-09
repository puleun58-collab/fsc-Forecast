'use client';

import { useEffect, useRef, useState } from 'react';

const SECTION_LINKS = [
  { id: 'operations', label: '운영 현황' },
  { id: 'diagnostics', label: '예측 품질·진단' },
  { id: 'tuning', label: '튜닝·검증' },
  { id: 'management', label: '관리·이력' },
] as const;

type AdminSectionId = (typeof SECTION_LINKS)[number]['id'];

function isAdminSectionId(value: string): value is AdminSectionId {
  return SECTION_LINKS.some((section) => section.id === value);
}

function readHashSection(): AdminSectionId | null {
  const hash = window.location.hash.slice(1);
  return isAdminSectionId(hash) ? hash : null;
}

export function AdminSectionNavigation() {
  const [activeSection, setActiveSection] = useState<AdminSectionId>('operations');
  const listRef = useRef<HTMLDivElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);
  const hashTargetRef = useRef<AdminSectionId | null>(null);

  useEffect(() => {
    let animationFrame = 0;
    let hashReleaseTimer = 0;

    function updateActiveSection(): void {
      const hashTarget = hashTargetRef.current;

      if (hashTarget !== null) {
        setActiveSection((current) => (current === hashTarget ? current : hashTarget));
        return;
      }

      const navigationBottom = listRef.current?.closest('nav')?.getBoundingClientRect().bottom ?? 0;
      const activationLine = navigationBottom + 24;
      const atPageEnd =
        Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 24;
      let nextSection: AdminSectionId = atPageEnd ? 'management' : 'operations';

      if (!atPageEnd) {
        for (const section of SECTION_LINKS) {
          const element = document.getElementById(section.id);

          if (element === null || element.getBoundingClientRect().top > activationLine) {
            break;
          }

          nextSection = section.id;
        }
      }

      setActiveSection((current) => (current === nextSection ? current : nextSection));
    }

    function scheduleUpdate(): void {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    }

    function selectHashSection(section: AdminSectionId): void {
      hashTargetRef.current = section;
      setActiveSection(section);
      window.clearTimeout(hashReleaseTimer);
      hashReleaseTimer = window.setTimeout(() => {
        hashTargetRef.current = null;
        scheduleUpdate();
      }, 1_600);
    }

    function handleHashChange(): void {
      const hashSection = readHashSection();

      if (hashSection !== null) {
        selectHashSection(hashSection);
      }
    }

    const hashSection = readHashSection();
    if (hashSection !== null) {
      selectHashSection(hashSection);
    }

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(hashReleaseTimer);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    const list = listRef.current;
    const link = activeLinkRef.current;

    if (list === null || link === null) {
      return;
    }

    const listBounds = list.getBoundingClientRect();
    const linkBounds = link.getBoundingClientRect();

    if (linkBounds.left >= listBounds.left && linkBounds.right <= listBounds.right) {
      return;
    }

    const centeredLeft =
      list.scrollLeft + linkBounds.left - listBounds.left - (listBounds.width - linkBounds.width) / 2;
    list.scrollTo({
      left: centeredLeft,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [activeSection]);

  return (
    <nav className="admin-section-nav" aria-label="관리자 페이지 영역 바로가기">
      <div ref={listRef} className="admin-section-nav__list">
        {SECTION_LINKS.map((section) => {
          const active = activeSection === section.id;

          return (
            <a
              key={section.id}
              ref={active ? activeLinkRef : null}
              className="admin-section-nav__link"
              href={`#${section.id}`}
              aria-current={active ? 'location' : undefined}
              onClick={() => {
                hashTargetRef.current = section.id;
                setActiveSection(section.id);
              }}
            >
              {section.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
