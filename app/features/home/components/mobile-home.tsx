'use client';

import {
  faBatteryThreeQuarters,
  faCloudSun,
  faHeart,
  faLocationDot,
  faSignal,
  faWandMagicSparkles,
  faWaveSquare,
  faWifi,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { PointerEvent, useEffect, useRef, useState } from 'react';
import { DOCK_ENTRIES, HOME_TIME, HomeEntry, PRIMARY_ENTRIES } from '../home.config';

const pageCount = 2;

function formatDeviceTime(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function useHomeTime() {
  const [time, setTime] = useState(HOME_TIME.backgroundTime);

  useEffect(() => {
    const update = () => setTime(
      HOME_TIME.mode === 'background' ? HOME_TIME.backgroundTime : formatDeviceTime(new Date()),
    );
    update();
    const timer = window.setInterval(update, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return time;
}

function AppEntry({ entry, dock = false, onOpen }: {
  entry: HomeEntry;
  dock?: boolean;
  onOpen: (label: string) => void;
}) {
  return (
    <button
      type="button"
      className={dock ? 'dock-entry' : 'app-entry'}
      onClick={() => onOpen(entry.label)}
      aria-label={`打开${entry.label}`}
    >
      <span className={`app-icon tone-${entry.tone}`} aria-hidden="true">
        <FontAwesomeIcon icon={entry.icon} />
      </span>
      <span className="entry-label">{entry.label}</span>
    </button>
  );
}

export function MobileHome() {
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState('');
  const pointerStart = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const time = useHomeTime();

  const openEntry = (label: string) => {
    setNotice(`${label} · 页面入口已预留`);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 1400);
  };

  useEffect(() => () => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    pointerStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) < 44) return;
    setPage((current) => Math.max(0, Math.min(pageCount - 1, current + (distance < 0 ? 1 : -1))));
  };

  return (
    <main className="app-stage">
      <section className="phone-shell" aria-label="电波机首页">
        <div className="home-wallpaper" aria-hidden="true" />

        <header className="status-bar" aria-label="设备状态">
          <time dateTime={time}>{time}</time>
          <div className="status-icons" aria-hidden="true">
            <FontAwesomeIcon icon={faSignal} />
            <FontAwesomeIcon icon={faWifi} />
            <FontAwesomeIcon icon={faBatteryThreeQuarters} />
          </div>
        </header>

        <div className="home-content">
          <section
            className="page-viewport"
            aria-label="可翻页的桌面"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { pointerStart.current = null; }}
          >
            <div className="page-track" style={{ transform: `translateX(-${page * 100}%)` }}>
              <section className="home-page" aria-label="首页第1页">
                <div className="icon-grid">
                  <article className="hero-widget" aria-label="电波机大组件">
                    <div className="widget-topline"><span>星期三</span><span>8月26日</span></div>
                    <div className="profile-orbit" aria-hidden="true">
                      <span className="orbit orbit-one" />
                      <span className="orbit orbit-two" />
                      <div className="profile-core"><FontAwesomeIcon icon={faWaveSquare} /></div>
                    </div>
                    <h1>电波机</h1>
                    <p className="hero-subtitle">爱意化作讯号</p>
                    <div className="hero-meta">
                      <span><FontAwesomeIcon icon={faLocationDot} /> 上海</span>
                      <span><FontAwesomeIcon icon={faCloudSun} /> 26°</span>
                    </div>
                    <div className="signal-wave" aria-hidden="true">
                      {Array.from({ length: 9 }, (_, index) => <span key={index} />)}
                    </div>
                  </article>

                  <article className="time-widget" aria-label="今日时间组件">
                    <div className="time-heading"><span>今日</span><FontAwesomeIcon icon={faHeart} /></div>
                    <strong>{time}</strong>
                    <p>昼夜电波</p>
                    <div className="week-strip" aria-label="近日日期">
                      <span>二<br />25</span>
                      <span className="is-today">三<br />26</span>
                      <span>四<br />27</span>
                    </div>
                  </article>

                  <nav className="primary-apps" aria-label="主要应用">
                    {PRIMARY_ENTRIES.map((entry) => (
                      <AppEntry key={entry.id} entry={entry} onOpen={openEntry} />
                    ))}
                  </nav>
                </div>
              </section>

              <section className="home-page" aria-label="首页第2页">
                <div className="next-page-placeholder">
                  <span aria-hidden="true"><FontAwesomeIcon icon={faWandMagicSparkles} /></span>
                  <strong>第二页</strong>
                  <p>等待下一组桌面内容</p>
                </div>
              </section>
            </div>
          </section>

          <div className="page-dots" role="group" aria-label="桌面分页">
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                className={page === index ? 'is-active' : ''}
                aria-label={`前往第${index + 1}页`}
                aria-pressed={page === index}
                onClick={() => setPage(index)}
              />
            ))}
          </div>

          <nav className="dock" aria-label="底部常用应用">
            {DOCK_ENTRIES.map((entry) => (
              <AppEntry key={entry.id} entry={entry} dock onOpen={openEntry} />
            ))}
          </nav>

          <div className={`entry-notice${notice ? ' is-visible' : ''}`} role="status" aria-live="polite">
            {notice}
          </div>
        </div>
      </section>
    </main>
  );
}
