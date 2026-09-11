'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { scheduleHashTargetRelease } from './admin-section-navigation-state';

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
  const hashReleaseTimerRef = useRef<number | null>(null);
  const scheduleUpdateRef = useRef<() => void>(() => undefined);

  const selectHashSection = useCallback((section: AdminSectionId): void => {
    hashTargetRef.current = section;
    setActiveSection(section);
    hashReleaseTimerRef.current = scheduleHashTargetRelease(
      hashReleaseTimerRef.current,
      () => {
        hashTargetRef.current = null;
        hashReleaseTimerRef.current = null;
        scheduleUpdateRef.current();
      },
    );
  }, []);

  useEffect(() => {
    let animationFrame = 0;

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

    function handleHashChange(): void {
      const hashSection = readHashSection();

      if (hashSection !== null) {
        selectHashSection(hashSection);
      }
    }

    scheduleUpdateRef.current = scheduleUpdate;

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
      if (hashReleaseTimerRef.current !== null) {
        window.clearTimeout(hashReleaseTimerRef.current);
        hashReleaseTimerRef.current = null;
      }
      scheduleUpdateRef.current = () => undefined;
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [selectHashSection]);

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
              onClick={() => selectHashSection(section.id)}
            >
              {section.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
