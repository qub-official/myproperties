/* Line icons (24x24, stroke based) and the Mochi mascot. */
(function () {
  const s = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    home: s('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>'),
    tree: s('<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 6v12a2 2 0 0 0 2 2h5"/><path d="M14 13h7M14 17h7M14 21h5"/>'),
    cpu: s('<rect x="5" y="5" width="14" height="14" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
    music: s('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
    sparkle: s('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6 6 2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
    wallpaper: s('<rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8 21h8M12 17v4"/><path d="m6.5 13.5 3.5-3.5 3 3 2-2 2.5 2.5"/><circle cx="15.5" cy="8" r="1.2"/>'),
    palette: s('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>'),
    info: s('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    settings: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    folder: s('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
    file: s('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>'),
    drive: s('<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 14h.01M11 14h6"/>'),
    usb: s('<path d="M8 3h8v6H8z"/><path d="M6 9h12v6a6 6 0 0 1-12 0Z"/><path d="M10 5.5h.01M14 5.5h.01"/>'),
    network: s('<rect x="3" y="3" width="18" height="7" rx="2"/><path d="M12 10v5M5 19h14M12 15v4M7 6.5h.01"/>'),
    disc: s('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>'),
    phone: s('<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18h2"/>'),
    computer: s('<rect x="2.5" y="4" width="19" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/>'),
    plus: s('<path d="M12 5v14M5 12h14"/>'),
    chevron: s('<path d="m9 6 6 6-6 6"/>'),
    download: s('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>'),
    search: s('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    x: s('<path d="M6 6l12 12M18 6 6 18"/>'),
    play: s('<path d="M7 4.5v15l12-7.5Z"/>'),
    stop: s('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
    refresh: s('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>'),
    reveal: s('<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
    video: s('<rect x="2.5" y="5" width="14" height="14" rx="2.5"/><path d="m16.5 10 5-3v10l-5-3"/>'),
    image: s('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.8"/><path d="m21 15-5-5L5 21"/>'),
    gpu: s('<rect x="2.5" y="6" width="19" height="11" rx="2"/><circle cx="9" cy="11.5" r="2.5"/><path d="M15 9.5h3M15 13.5h3M5 17v3M9 17v3"/>'),
    memory: s('<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 7v10M11 7v10M15 7v10M5 17v3M19 17v3"/>'),
    windows: s('<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="1"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="1"/><rect x="13" y="13" width="7.5" height="7.5" rx="1"/>'),
    battery: s('<rect x="2.5" y="7" width="17" height="10" rx="2.5"/><path d="M22 11v2M6 10.5v3M9.5 10.5v3"/>'),
    board: s('<rect x="3" y="3" width="18" height="18" rx="2.5"/><rect x="7" y="7" width="5" height="5" rx="1"/><path d="M15 7h2M15 10h2M7 15h10M7 18h6"/>'),
    sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: s('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
    github: s('<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>')
  };

  function mascot(mood = 'happy') {
    const eyes = mood === 'sleepy'
      ? '<path d="M41 60h8M71 60h8" stroke="#0C0F14" stroke-width="3" stroke-linecap="round"/>'
      : '<circle cx="45" cy="60" r="4.2" fill="#0C0F14"/><circle cx="75" cy="60" r="4.2" fill="#0C0F14"/><circle cx="46.4" cy="58.6" r="1.3" fill="#fff"/><circle cx="76.4" cy="58.6" r="1.3" fill="#fff"/>';
    return `<svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <ellipse cx="60" cy="104" rx="34" ry="5" fill="#0C0F14" opacity=".08"/>
      <path d="M60 22c-3-7 1-13 8-14-1 6-3 10-8 14Z" fill="#A87C3A"/>
      <path d="M60 22c-1-5-5-8-10-8 1 5 5 8 10 8Z" fill="#B49A85"/>
      <path d="M18 74c0-28 18-50 42-50s42 22 42 50c0 18-16 26-42 26S18 92 18 74Z" fill="#FFFFFF" stroke="#0C0F14" stroke-width="3"/>
      <path d="M30 82c6 6 16 9 30 9" stroke="#E9E4E0" stroke-width="4" stroke-linecap="round"/>
      ${eyes}
      <ellipse cx="36" cy="71" rx="6" ry="3.5" fill="#B08A8A" opacity=".55"/>
      <ellipse cx="84" cy="71" rx="6" ry="3.5" fill="#B08A8A" opacity=".55"/>
      <path d="M55 69c2.5 3 7.5 3 10 0" stroke="#0C0F14" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M96 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#FDEBB0" stroke="#A87C3A" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`;
  }

  function logo() {
    return `<svg viewBox="0 0 32 32" fill="none"><rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="#0C0F14"/><path d="M8 20c0-5.5 3.6-9.5 8-9.5s8 4 8 9.5c0 2.6-3.6 3.6-8 3.6S8 22.6 8 20Z" fill="#F5F4F2"/><circle cx="13.2" cy="17.4" r="1.15" fill="#0C0F14"/><circle cx="18.8" cy="17.4" r="1.15" fill="#0C0F14"/><path d="M16 10.4c-.5-1.8.3-3.2 2-3.6-.2 1.6-.8 2.7-2 3.6Z" fill="#A87C3A"/></svg>`;
  }

  window.Icons = { ...I, mascot, logo };
})();
