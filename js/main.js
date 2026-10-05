/* =========================================================
   AQTIS · интерактив: прокрутка, главы истории, услуги,
   врачи, отзывы, онлайн-запись с живым талоном
   ========================================================= */
(() => {
  const EN = document.documentElement.lang.startsWith("en");
  const L = (ru, en) => (EN ? en : ru);
  const LOC = EN ? "en-US" : "ru-RU";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, "0");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const store = {
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
  };

  /* ---------------- плавная прокрутка ---------------- */
  const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  let lenis = null;
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  if (!reduce && typeof window.Lenis !== "undefined") {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
    if (hasGsap) {
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const loop = t => { lenis.raf(t); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }
  const scrollTo = (target, opts = {}) => {
    if (lenis) lenis.scrollTo(target, { offset: opts.offset ?? 0, duration: 1.4 });
    else (typeof target === "number" ? window.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" }) : target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }));
  };
  $$('a[href^="#"]').forEach(a => a.addEventListener("click", e => {
    const id = a.getAttribute("href");
    if (id.length < 2) return;
    const el = id === "#top" ? document.body : $(id);
    if (!el) return;
    e.preventDefault();
    setDrawer(false);
    if (id === "#top") return scrollTo(0);
    // главы: прокручиваем к моменту, когда глава уже «встала»
    const ch = el.classList.contains("chapter") ? innerHeight * 0.5 : 0;
    const top = el.getBoundingClientRect().top + window.scrollY + ch - (ch ? 0 : 76);
    scrollTo(top);
  }));

  /* ---------------- навигация ---------------- */
  const nav = $("#nav");
  const burger = $("#burger"), drawer = $("#drawer");
  function setDrawer(open) {
    burger.setAttribute("aria-expanded", open);
    burger.setAttribute("aria-label", open ? L("Закрыть меню", "Close menu") : L("Открыть меню", "Open menu"));
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", !open);
    if (lenis) open ? lenis.stop() : lenis.start();
    document.body.style.overflow = open ? "hidden" : "";
  }
  burger.addEventListener("click", () => setDrawer(burger.getAttribute("aria-expanded") !== "true"));
  document.addEventListener("keydown", e => { if (e.key === "Escape") setDrawer(false); });

  /* ---------------- история: главы, рейка, шкала VITA ---------------- */
  const journey = $("#journey");
  const rail = $("#rail");
  const railLinks = $$("a", rail);
  const chapters = $$(".chapter");
  const shadeScale = $("#shadeScale");
  let lastK = 0;
  function story() {
    const u = -journey.getBoundingClientRect().top / Math.max(1, innerHeight);
    journey.style.setProperty("--u", clamp(u, 0, 7).toFixed(3));
    nav.classList.toggle("is-scrolled", window.scrollY > 8);
    rail.classList.toggle("is-visible", u > 0.55 && u < 6.3);
    const k = u < 2.5 ? 1 : u < 4.5 ? 2 : 3;
    if (k !== lastK) { railLinks.forEach(a => a.classList.toggle("is-active", +a.dataset.ch === k)); lastK = k; }
    chapters.forEach(c => {
      const n = +c.dataset.ch;
      c.classList.toggle("is-active", u > 2 * n - 1.45 && u < 2 * n + 0.35);
    });
    if (shadeScale) shadeScale.style.setProperty("--si", (smooth(4.8, 5.85, u) * 6).toFixed(3));
  }
  if (hasGsap) ScrollTrigger.create({ trigger: journey, start: "top top", end: "bottom top", onUpdate: story, onRefresh: story });
  else window.addEventListener("scroll", story, { passive: true });
  if (lenis) lenis.on("scroll", story);
  window.addEventListener("resize", story);
  story();

  /* ---------------- заголовки по словам ---------------- */
  $$("[data-split]").forEach(el => {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/([ \t\n\r]+)/);
          const frag = document.createDocumentFragment();
          parts.forEach(p => {
            if (!p) return;
            if (/^[ \t\n\r]+$/.test(p)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span");
            w.className = "w";
            const inner = document.createElement("span");
            inner.style.setProperty("--i", i++);
            inner.textContent = p;
            w.appendChild(inner);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    const label = el.textContent.replace(/\s+/g, " ").trim();
    walk(el);
    el.setAttribute("aria-label", label);
  });

  /* ---------------- появление ---------------- */
  $$(".services-note, .svc-list li, .doc-portrait, .doc-list, .score, .quotes, .booking-head p, .booking-form, .ticket-wrap, .contact-card")
    .forEach(el => el.setAttribute("data-reveal", ""));
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    if (el.hasAttribute("data-split")) el.classList.add("split-in");
    else {
      const sibs = [...el.parentElement.children].filter(c => c.hasAttribute("data-reveal"));
      el.style.transitionDelay = Math.min(Math.max(sibs.indexOf(el), 0), 7) * 60 + "ms";
      el.classList.add("in");
    }
    if (el.classList.contains("score")) countScore();
    io.unobserve(el);
  }), { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
  $$("[data-reveal], [data-split]").forEach(el => io.observe(el));
  // заголовок hero появляется сразу
  requestAnimationFrame(() => $(".hero h1")?.classList.add("split-in"));

  /* ---------------- магнитные кнопки ---------------- */
  if (canHover && !reduce) {
    $$(".magnetic").forEach(b => {
      b.addEventListener("pointermove", e => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.25;
        const y = (e.clientY - r.top - r.height / 2) * 0.35;
        b.style.transform = `translate(${x}px, ${y}px)`;
      });
      b.addEventListener("pointerleave", () => {
        b.style.transition = "transform .6s cubic-bezier(.16,1,.3,1)";
        b.style.transform = "";
        setTimeout(() => (b.style.transition = ""), 600);
      });
    });
  }

  /* ---------------- услуги: фото за курсором ---------------- */
  const svcList = $("#svcList");
  const float = $("#svcFloat"), floatImg = $("#svcFloatImg");
  if (canHover && svcList) {
    $$(".svc", svcList).forEach(b => { const im = new Image(); im.src = b.dataset.img; });
    const pos = { x: 0, y: 0, tx: 0, ty: 0, rot: 0, on: false };
    let raf = 0;
    const tick = () => {
      const dx = pos.tx - pos.x;
      pos.x += dx * 0.14;
      pos.y += (pos.ty - pos.y) * 0.14;
      pos.rot += (clamp(dx * 0.06, -10, 10) - pos.rot) * 0.12;
      float.style.transform = `translate(${pos.x - 140}px, ${pos.y - 175}px) rotate(${pos.rot}deg)`;
      if (pos.on || Math.abs(dx) > 0.5) raf = requestAnimationFrame(tick);
      else raf = 0;
    };
    svcList.addEventListener("pointermove", e => {
      pos.tx = e.clientX + 40; pos.ty = e.clientY;
      if (!pos.on) { pos.x = pos.tx; pos.y = pos.ty; }
      if (!raf) raf = requestAnimationFrame(tick);
    });
    $$(".svc", svcList).forEach(b => b.addEventListener("pointerenter", () => {
      if (floatImg.getAttribute("src") !== b.dataset.img) floatImg.src = b.dataset.img;
      pos.on = true;
      float.classList.add("is-on");
    }));
    svcList.addEventListener("pointerleave", () => { pos.on = false; float.classList.remove("is-on"); });
  }

  /* ---------------- врачи ---------------- */
  const docs = $$(".doc");
  const portraits = $$("#docPortrait img");
  docs.forEach(d => $(".doc-name", d).addEventListener("click", () => {
    docs.forEach(x => {
      const on = x === d;
      x.classList.toggle("is-open", on);
      $(".doc-name", x).setAttribute("aria-selected", on);
    });
    portraits.forEach(p => p.classList.toggle("is-on", p.dataset.for === d.dataset.doc));
  }));

  /* ---------------- отзывы ---------------- */
  const quotes = $$(".quote");
  const bars = $("#quoteBars");
  let qi = 0, qStart = performance.now(), qPaused = false;
  const Q_TIME = 7000;
  quotes.forEach((_, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", L(`Отзыв ${i + 1}`, `Review ${i + 1}`));
    b.addEventListener("click", () => showQuote(i));
    bars.appendChild(b);
  });
  const barEls = [...bars.children];
  function showQuote(i) {
    qi = (i + quotes.length) % quotes.length;
    quotes.forEach((q, k) => q.classList.toggle("is-on", k === qi));
    barEls.forEach((b, k) => b.style.setProperty("--p", k < qi ? 1 : 0));
    qStart = performance.now();
  }
  $("#qPrev").addEventListener("click", () => showQuote(qi - 1));
  $("#qNext").addEventListener("click", () => showQuote(qi + 1));
  const quotesBox = $("#quotes");
  quotesBox.addEventListener("pointerenter", () => (qPaused = true));
  quotesBox.addEventListener("pointerleave", () => { qPaused = false; qStart = performance.now() - (parseFloat(barEls[qi].style.getPropertyValue("--p")) || 0) * Q_TIME; });
  let swipeX = null;
  quotesBox.addEventListener("pointerdown", e => (swipeX = e.clientX));
  quotesBox.addEventListener("pointerup", e => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    if (Math.abs(dx) > 50) showQuote(qi + (dx < 0 ? 1 : -1));
    swipeX = null;
  });
  const qTick = now => {
    if (!qPaused && !reduce) {
      const p = (now - qStart) / Q_TIME;
      barEls[qi].style.setProperty("--p", Math.min(1, p).toFixed(3));
      if (p >= 1) showQuote(qi + 1);
    }
    requestAnimationFrame(qTick);
  };
  requestAnimationFrame(qTick);

  let scoreDone = false;
  function countScore() {
    if (scoreDone) return;
    scoreDone = true;
    const el = $(".score-num");
    const fmt = n => n.toLocaleString(LOC, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (reduce) return;
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 1400);
      el.textContent = fmt(4.9 * (1 - Math.pow(1 - k, 4)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* =========================================================
     ОНЛАЙН-ЗАПИСЬ
     ========================================================= */
  const form = $("#bookingForm");
  const doctorSel = $("#doctorSelect");
  const datesEl = $("#dates"), timesEl = $("#times"), hint = $("#slotHint");
  const errEl = $("#formError");
  const ticket = $("#ticket");
  const submitBtn = $("#submitBtn");
  const done = $("#bookingDone");

  const SERVICES = {
    consult: L("Консультация", "Consultation"), therapy: L("Лечение", "Treatment"), implant: L("Имплантация", "Implants"),
    prosthetics: L("Коронки и виниры", "Crowns & veneers"), ortho: L("Ортодонтия", "Orthodontics"), whitening: L("Отбеливание", "Whitening"),
    hygiene: L("Гигиена", "Hygiene"), kids: L("Детская", "Kids"), surgery: L("Хирургия", "Surgery"),
  };
  // дни работы врачей: 0 — вс … 6 — сб
  const DOCTORS = {
    any: { name: L("Любой свободный врач", "Any available dentist"), days: [1, 2, 3, 4, 5, 6] },
    arman: { name: L("Арман Сейтжанов", "Arman Seitzhanov"), days: [1, 2, 3, 4, 5] },
    aigerim: { name: L("Айгерим Нурланова", "Aigerim Nurlanova"), days: [1, 3, 5, 6] },
    elena: { name: L("Елена Ким", "Elena Kim"), days: [2, 3, 4, 6] },
    timur: { name: L("Тимур Абдрахманов", "Timur Abdrakhmanov"), days: [1, 2, 4, 5, 6] },
  };
  const SERVICE_DOCTOR = { implant: "arman", surgery: "arman", ortho: "aigerim", therapy: "elena", prosthetics: "timur", whitening: "timur" };

  const state = { date: null, time: null };
  const DAYS = 14;
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

  function slotsFor(date) {
    const end = date.getDay() === 6 ? 17 : 20;
    const out = [];
    for (let h = 9; h <= end; h++) for (const m of [0, 30]) { if (h === end && m === 30) continue; out.push(`${pad(h)}:${pad(m)}`); }
    return out;
  }
  function isBusy(dateKey, time, doctor) {
    if (doctor === "any") {
      return Object.keys(DOCTORS).filter(d => d !== "any" && DOCTORS[d].days.includes(fromKey(dateKey).getDay()))
        .every(d => hash(dateKey + time + d) < 0.42);
    }
    return hash(dateKey + time + doctor) < 0.42;
  }
  function freeSlots(d) {
    const key = keyOf(d);
    const now = new Date();
    const isToday = keyOf(now) === key;
    return slotsFor(d).filter(t => {
      if (isToday) { const [h, m] = t.split(":").map(Number); if (h * 60 + m < now.getHours() * 60 + now.getMinutes() + 60) return false; }
      return !isBusy(key, t, doctorSel.value);
    });
  }

  function renderDates() {
    const doc = DOCTORS[doctorSel.value];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    datesEl.innerHTML = "";
    let firstFree = null;
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const key = keyOf(d);
      const hasFree = doc.days.includes(d.getDay()) && freeSlots(d).length > 0;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "date";
      b.setAttribute("role", "radio");
      b.dataset.key = key;
      b.disabled = !hasFree;
      const label = i === 0 ? L("Сег", "Today") : i === 1 ? L("Завт", "Tmrw") : d.toLocaleDateString(LOC, { weekday: "short" }).replace(".", "");
      b.innerHTML = `<small>${label}</small><b>${d.getDate()}</b>`;
      b.setAttribute("aria-label", d.toLocaleDateString(LOC, { weekday: "long", day: "numeric", month: "long" }) + (hasFree ? "" : L(", нет приёма", ", unavailable")));
      b.addEventListener("click", () => selectDate(key));
      datesEl.appendChild(b);
      if (hasFree && !firstFree) firstFree = key;
    }
    const keep = state.date && !datesEl.querySelector(`[data-key="${state.date}"]`)?.disabled;
    selectDate(keep ? state.date : firstFree, true);
  }

  function selectDate(key, keepTime = false) {
    state.date = key;
    $$(".date", datesEl).forEach(b => {
      const on = b.dataset.key === key;
      b.setAttribute("aria-checked", on);
      b.tabIndex = on ? 0 : -1;
      if (on && !keepTime) b.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
    });
    if (!keepTime) state.time = null;
    renderTimes();
  }

  function renderTimes() {
    timesEl.innerHTML = "";
    if (!state.date) { hint.textContent = L("Нет свободных дат на две недели, позвоните нам.", "No free dates in the next two weeks, please call us."); updateTicket(); return; }
    const d = fromKey(state.date);
    const free = new Set(freeSlots(d));
    if (state.time && !free.has(state.time)) state.time = null;
    for (const t of slotsFor(d)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "time";
      b.textContent = t;
      b.setAttribute("role", "radio");
      b.disabled = !free.has(t);
      b.setAttribute("aria-checked", state.time === t);
      b.addEventListener("click", () => { state.time = t; renderTimes(); errEl.textContent = ""; });
      timesEl.appendChild(b);
    }
    const n = free.size;
    const word = EN ? (n === 1 ? "slot" : "slots") : (n % 10 === 1 && n % 100 !== 11 ? "окно" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "окна" : "окон");
    hint.textContent = L(`Свободно ${n} ${word}`, `${n} free ${word}`);
    updateTicket();
  }

  /* талон обновляется по мере выбора */
  const tk = name => $(`[data-t="${name}"]`, ticket);
  function setT(name, value, empty) {
    const el = tk(name);
    if (el.textContent === value) return;
    el.textContent = value;
    el.classList.toggle("is-empty", !!empty);
    el.classList.remove("flip");
    void el.offsetWidth;
    el.classList.add("flip");
  }
  function updateTicket() {
    setT("service", SERVICES[form.elements.service.value]);
    setT("doctor", DOCTORS[doctorSel.value].name);
    if (state.date) setT("date", fromKey(state.date).toLocaleDateString(LOC, { weekday: "long", day: "numeric", month: "long" }));
    else setT("date", L("Выберите дату", "Pick a date"), true);
    setT("time", state.time || "--:--", !state.time);
    const nm = form.elements.name.value.trim();
    setT("name", nm || L("Ваше имя", "Your name"), !nm);
  }

  doctorSel.addEventListener("change", renderDates);
  form.addEventListener("change", e => {
    if (e.target.name !== "service") return;
    const s = e.target.value;
    // подсказываем профильного врача, если пациент ещё не выбирал
    if (SERVICE_DOCTOR[s] && doctorSel.value === "any") { doctorSel.value = SERVICE_DOCTOR[s]; renderDates(); }
    updateTicket();
  });
  form.elements.name.addEventListener("input", updateTicket);

  const goBooking = () => scrollTo($("#booking").getBoundingClientRect().top + window.scrollY - 76);
  $$("[data-service]").forEach(b => b.addEventListener("click", () => {
    const s = b.dataset.service;
    const radio = form.querySelector(`input[name="service"][value="${s}"]`);
    if (radio) radio.checked = true;
    if (SERVICE_DOCTOR[s]) { doctorSel.value = SERVICE_DOCTOR[s]; renderDates(); }
    updateTicket();
    goBooking();
  }));
  $$("[data-doctor]").forEach(b => b.addEventListener("click", () => {
    doctorSel.value = b.dataset.doctor;
    renderDates();
    goBooking();
  }));

  // маска телефона
  const phone = form.elements.phone;
  const maskPhone = v => {
    let d = v.replace(/\D/g, "");
    if (!d) return "";
    if (d[0] === "8") d = "7" + d.slice(1);
    if (d[0] !== "7") d = "7" + d;
    d = d.slice(0, 11);
    const a = d.slice(1, 4), b = d.slice(4, 7), c = d.slice(7, 9), e = d.slice(9, 11);
    let out = "+7";
    if (a) out += ` (${a}${a.length === 3 ? ")" : ""}`;
    if (b) out += ` ${b}`;
    if (c) out += `-${c}`;
    if (e) out += `-${e}`;
    return out;
  };
  phone.addEventListener("input", e => {
    if (e.inputType && e.inputType.startsWith("delete")) return;
    phone.value = maskPhone(phone.value);
  });
  phone.addEventListener("focus", () => { if (!phone.value) phone.value = "+7 "; });
  phone.addEventListener("blur", () => { if (phone.value.replace(/\D/g, "").length <= 1) phone.value = ""; });
  [form.elements.name, phone].forEach(inp => inp.addEventListener("input", () => inp.closest(".input").classList.remove("is-invalid")));

  form.addEventListener("submit", e => {
    e.preventDefault();
    errEl.textContent = "";
    const name = form.elements.name.value.trim();
    const digits = phone.value.replace(/\D/g, "");
    let err = "", focus = null;
    if (!state.date || !state.time) { err = L("Выберите дату и время приёма.", "Pick a date and time."); focus = timesEl.querySelector(".time:not(:disabled)"); }
    else if (name.length < 2) { err = L("Напишите, как к вам обращаться.", "Tell us your name."); focus = form.elements.name; }
    else if (digits.length !== 11) { err = L("Проверьте номер телефона: нужно 10 цифр после +7.", "Check your phone number: 10 digits after +7."); focus = phone; }
    else if (!form.elements.consent.checked) { err = L("Нужно согласие на обработку данных.", "Please accept the data processing terms."); focus = form.elements.consent; }
    if (err) {
      errEl.textContent = err;
      focus?.closest(".input")?.classList.add("is-invalid");
      focus?.focus({ preventScroll: true });
      if (focus) scrollTo(focus.getBoundingClientRect().top + window.scrollY - innerHeight / 3);
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = L("Отправляем…", "Sending…");
    const booking = {
      service: form.elements.service.value, doctor: doctorSel.value, date: state.date, time: state.time,
      name, phone: phone.value, comment: form.elements.comment.value.trim(), createdAt: new Date().toISOString(),
    };
    // демо: бэкенда нет, сохраняем локально
    setTimeout(() => {
      store.set("aqtis:booking", booking);
      ticket.classList.add("is-booked");
      form.inert = true;
      submitBtn.hidden = true;
      $("#doneText").textContent = L(
        `${name}, администратор перезвонит на ${phone.value} в течение 15 минут и подтвердит запись.`,
        `${name}, our front desk will call ${phone.value} within 15 minutes to confirm.`
      );
      $("#icsLink").href = icsUrl(booking);
      done.hidden = false;
      submitBtn.disabled = false;
      submitBtn.innerHTML = L("Записаться", "Book now") + ' <i class="ph ph-arrow-right"></i>';
    }, 650);
  });

  let icsObj = null;
  function icsUrl(b) {
    const [y, m, d] = b.date.split("-");
    const [hh, mm] = b.time.split(":");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AQTIS//Booking//RU", "BEGIN:VEVENT",
      `UID:${Date.now()}@aqtis.kz`, `DTSTAMP:${stamp}`,
      `DTSTART:${y}${m}${d}T${hh}${mm}00`, `DTEND:${y}${m}${d}T${pad(+hh + 1)}${mm}00`,
      `SUMMARY:${L("Приём в AQTIS", "AQTIS dental appointment")}: ${SERVICES[b.service]}`,
      `LOCATION:${L("Алматы, пр. Достык, 128", "128 Dostyk Ave, Almaty")}`,
      `DESCRIPTION:${DOCTORS[b.doctor].name}`,
      "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${L("Приём у стоматолога", "Dental appointment")}`, "END:VALARM",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    if (icsObj) URL.revokeObjectURL(icsObj);
    icsObj = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    return icsObj;
  }

  $("#againBtn").addEventListener("click", () => {
    ticket.classList.remove("is-booked");
    form.inert = false;
    submitBtn.hidden = false;
    done.hidden = true;
    state.time = null;
    renderDates();
  });

  $("#waLink").addEventListener("click", () => {
    const s = SERVICES[form.elements.service.value];
    const when = state.date && state.time ? `, ${fromKey(state.date).toLocaleDateString(LOC, { day: "numeric", month: "long" })} ${state.time}` : "";
    $("#waLink").href = "https://wa.me/77000000000?text=" + encodeURIComponent(L(`Здравствуйте! Хочу записаться: ${s}${when}`, `Hello! I'd like to book: ${s}${when}`));
  });

  renderDates();

  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
  window.addEventListener("load", () => hasGsap && ScrollTrigger.refresh());
})();
