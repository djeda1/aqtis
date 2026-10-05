/* =========================================================
   AQTIS · интерактив: меню, режимы 3D, отзывы, онлайн-запись
   ========================================================= */
(() => {
  const EN = document.documentElement.lang.startsWith("en");
  const L = (ru, en) => (EN ? en : ru);
  const LOC = EN ? "en-US" : "ru-RU";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, "0");

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
  };

  /* ---------------- навигация ---------------- */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const burger = $("#burger"), drawer = $("#drawer");
  const setDrawer = open => {
    burger.setAttribute("aria-expanded", open);
    burger.setAttribute("aria-label", open ? L("Закрыть меню", "Close menu") : L("Открыть меню", "Open menu"));
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", !open);
    document.body.style.overflow = open ? "hidden" : "";
  };
  burger.addEventListener("click", () => setDrawer(burger.getAttribute("aria-expanded") !== "true"));
  $$("a", drawer).forEach(a => a.addEventListener("click", () => setDrawer(false)));
  document.addEventListener("keydown", e => { if (e.key === "Escape") setDrawer(false); });

  /* ---------------- режимы 3D-модели ---------------- */
  const hero = $("#hero");
  const caption = $("#stageCaption");
  const CAPTIONS = {
    natural: L("Моляр в 3D. Эмаль самая твёрдая ткань организма, поэтому лечим под микроскопом и снимаем минимум.",
               "A molar in 3D. Enamel is the hardest tissue in the body, so we treat under a microscope and remove as little as possible."),
    implant: L("Титановый имплант заменяет корень, циркониевая коронка видимую часть. Приживается за 3-4 месяца, гарантия 10 лет.",
               "A titanium implant replaces the root, a zirconia crown replaces what you see. Heals in 3-4 months, 10-year warranty."),
    whitening: L("ZOOM 4: до 8 тонов светлее за один визит. Следите за шкалой VITA справа.",
                 "ZOOM 4: up to 8 shades lighter in one visit. Watch the VITA shade on the right."),
  };
  hero.dataset.mode = "natural";
  $$(".mode").forEach(btn => btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    $$(".mode").forEach(b => { const on = b === btn; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on); });
    hero.dataset.mode = mode;
    caption.textContent = CAPTIONS[mode];
    window.dispatchEvent(new CustomEvent("aq:mode", { detail: { mode } }));
  }));
  $("#tooth3d").addEventListener("pointerdown", () => hero.classList.add("was-dragged"), { once: true });

  /* ---------------- нижняя панель на телефоне ----------------
     появляется, когда кнопки hero ушли с экрана, и прячется у формы записи */
  const mbar = $("#mbar");
  if (mbar && "IntersectionObserver" in window) {
    let heroVis = true, bookVis = false;
    const upd = () => mbar.classList.toggle("is-on", !heroVis && !bookVis);
    new IntersectionObserver(([e]) => { heroVis = e.isIntersecting || e.boundingClientRect.top > 0; upd(); })
      .observe($(".hero-actions"));
    new IntersectionObserver(([e]) => { bookVis = e.isIntersecting; upd(); }, { rootMargin: "0px 0px -25% 0px" })
      .observe($(".booking-card"));
  }

  /* ---------------- счётчики ---------------- */
  const countUp = el => {
    const end = +el.dataset.count;
    const fmt = n => (el.hasAttribute("data-sep") ? Math.round(n).toLocaleString(LOC) : String(Math.round(n)));
    if (reduce) { el.textContent = fmt(end); return; }
    const t0 = performance.now(), dur = 1600;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  $$("[data-count]").forEach(countUp);

  /* ---------------- появление ---------------- */
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const sibs = [...el.parentElement.children].filter(c => c.hasAttribute("data-reveal"));
    el.style.transitionDelay = Math.min(sibs.indexOf(el), 5) * 70 + "ms";
    el.classList.add("in");
    io.unobserve(el);
  }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  $$("[data-reveal]").forEach(el => io.observe(el));

  /* ---------------- отзывы ---------------- */
  const track = $("#revTrack"), prev = $("#revPrev"), next = $("#revNext");
  const stepSize = () => { const card = track.firstElementChild; return card ? card.getBoundingClientRect().width + 20 : 300; };
  const updateArrows = () => {
    prev.disabled = track.scrollLeft < 4;
    next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4;
  };
  prev.addEventListener("click", () => track.scrollBy({ left: -stepSize(), behavior: reduce ? "auto" : "smooth" }));
  next.addEventListener("click", () => track.scrollBy({ left: stepSize(), behavior: reduce ? "auto" : "smooth" }));
  track.addEventListener("scroll", updateArrows, { passive: true });
  window.addEventListener("resize", updateArrows);
  updateArrows();

  /* =========================================================
     ОНЛАЙН-ЗАПИСЬ
     ========================================================= */
  const form = $("#bookingForm");
  const doctorSel = $("#doctorSelect");
  const datesEl = $("#dates"), timesEl = $("#times"), hint = $("#slotHint");
  const errEl = $("#formError");
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
  const fmtDay = d => d.toLocaleDateString(LOC, { weekday: "short" }).replace(".", "");
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }

  function slotsFor(date) {
    const dow = date.getDay();
    const end = dow === 6 ? 17 : 20;
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

  function renderDates() {
    const doc = DOCTORS[doctorSel.value];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    datesEl.innerHTML = "";
    let firstFree = null;
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const key = keyOf(d);
      const works = doc.days.includes(d.getDay());
      const hasFree = works && freeSlots(d).length > 0;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "date";
      b.setAttribute("role", "radio");
      b.dataset.key = key;
      b.disabled = !hasFree;
      const label = i === 0 ? L("Сег", "Today") : i === 1 ? L("Завт", "Tmrw") : fmtDay(d);
      b.innerHTML = `<small>${label}</small><b>${d.getDate()}</b>`;
      b.setAttribute("aria-label", d.toLocaleDateString(LOC, { weekday: "long", day: "numeric", month: "long" }) + (hasFree ? "" : L(", нет приёма", ", unavailable")));
      b.addEventListener("click", () => selectDate(key));
      datesEl.appendChild(b);
      if (hasFree && !firstFree) firstFree = key;
    }
    const keep = state.date && !datesEl.querySelector(`[data-key="${state.date}"]`)?.disabled;
    selectDate(keep ? state.date : firstFree, true);
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
    if (!state.date) { hint.textContent = L("Нет свободных дат на две недели, позвоните нам.", "No free dates in the next two weeks, please call us."); return; }
    const d = fromKey(state.date);
    const free = new Set(freeSlots(d));
    if (state.time && !free.has(state.time)) state.time = null;
    const isToday = keyOf(new Date()) === state.date;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    for (const t of slotsFor(d)) {
      // прошедшее время сегодня не показываем вовсе, чтобы не было стены зачёркнутых слотов
      if (isToday) { const [h, m] = t.split(":").map(Number); if (h * 60 + m < nowMin + 60) continue; }
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
    hint.textContent = state.time
      ? L(`Выбрано: ${d.toLocaleDateString(LOC, { day: "numeric", month: "long", weekday: "long" })}, ${state.time}`,
          `Selected: ${d.toLocaleDateString(LOC, { weekday: "long", month: "long", day: "numeric" })}, ${state.time}`)
      : L(`Свободно ${n} ${word}`, `${n} free ${word}`);
  }

  doctorSel.addEventListener("change", renderDates);

  // кнопки «Записаться» в услугах и у врачей
  const goBooking = () => $("#booking").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  // вся карточка услуги нажимается, а не только стрелка
  $$(".svc").forEach(card => card.addEventListener("click", e => {
    if (e.target.closest("button")) return;
    card.querySelector(".svc-book")?.click();
  }));
  $$("[data-service]").forEach(b => b.addEventListener("click", () => {
    const s = b.dataset.service;
    const radio = form.querySelector(`input[name="service"][value="${s}"]`);
    if (radio) radio.checked = true;
    if (SERVICE_DOCTOR[s] && doctorSel.value === "any") { doctorSel.value = SERVICE_DOCTOR[s]; renderDates(); }
    goBooking();
  }));
  $$("[data-doctor]").forEach(b => b.addEventListener("click", () => {
    doctorSel.value = b.dataset.doctor;
    renderDates();
    goBooking();
  }));
  form.addEventListener("change", e => {
    if (e.target.name !== "service") return;
    const s = e.target.value;
    // подсказываем профильного врача, если пациент ещё не выбирал
    if (SERVICE_DOCTOR[s] && doctorSel.value === "any") { doctorSel.value = SERVICE_DOCTOR[s]; renderDates(); }
  });

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
    let err = "";
    let focus = null;
    if (!state.date || !state.time) { err = L("Выберите дату и время приёма.", "Pick a date and time."); focus = timesEl.querySelector(".time:not(:disabled)"); }
    else if (name.length < 2) { err = L("Напишите, как к вам обращаться.", "Tell us your name."); focus = form.elements.name; }
    else if (digits.length !== 11) { err = L("Проверьте номер телефона: нужно 10 цифр после +7.", "Check your phone number: 10 digits after +7."); focus = phone; }
    else if (!form.elements.consent.checked) { err = L("Нужно согласие на обработку данных.", "Please accept the data processing terms."); focus = form.elements.consent; }
    if (err) {
      errEl.textContent = err;
      if (focus && focus.closest(".input")) focus.closest(".input").classList.add("is-invalid");
      focus?.focus({ preventScroll: false });
      return;
    }

    const btn = $("#submitBtn");
    btn.disabled = true;
    btn.textContent = L("Отправляем…", "Sending…");
    const booking = {
      service: form.elements.service.value,
      doctor: doctorSel.value,
      date: state.date,
      time: state.time,
      name, phone: phone.value,
      comment: form.elements.comment.value.trim(),
      createdAt: new Date().toISOString(),
    };
    // демо: бэкенда нет, сохраняем локально
    setTimeout(() => {
      store.set("aqtis:booking", booking);
      showDone(booking);
      btn.disabled = false;
      btn.innerHTML = L("Записаться", "Book") + ' <i class="ph ph-arrow-right"></i>';
    }, 700);
  });

  function showDone(b) {
    const d = fromKey(b.date);
    const dateStr = d.toLocaleDateString(LOC, { weekday: "long", day: "numeric", month: "long" });
    $("#doneText").textContent = L(
      `${b.name}, администратор перезвонит на ${b.phone} в течение 15 минут и подтвердит запись.`,
      `${b.name}, our front desk will call ${b.phone} within 15 minutes to confirm.`
    );
    const rows = [
      [L("Услуга", "Service"), SERVICES[b.service]],
      [L("Врач", "Dentist"), DOCTORS[b.doctor].name],
      [L("Когда", "When"), `${dateStr}, ${b.time}`],
      [L("Где", "Where"), L("пр. Достык, 128, 2 этаж", "128 Dostyk Ave, 2nd floor")],
    ];
    const dl = $("#doneList");
    dl.innerHTML = "";
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      dl.append(dt, dd);
    });
    $("#icsLink").href = icsUrl(b);
    form.hidden = true;
    done.hidden = false;
    done.closest(".booking-card").scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }

  let icsObj = null;
  function icsUrl(b) {
    const [y, m, d] = b.date.split("-");
    const [hh, mm] = b.time.split(":");
    const endH = pad(+hh + 1);
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AQTIS//Booking//RU", "BEGIN:VEVENT",
      `UID:${Date.now()}@aqtis.kz`, `DTSTAMP:${stamp}`,
      `DTSTART:${y}${m}${d}T${hh}${mm}00`, `DTEND:${y}${m}${d}T${endH}${mm}00`,
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
    done.hidden = true;
    form.hidden = false;
    state.time = null;
    renderDates();
  });

  // ссылка WhatsApp подставляет выбранное
  $("#waLink").addEventListener("click", () => {
    const s = SERVICES[form.elements.service.value];
    const when = state.date && state.time ? `, ${fromKey(state.date).toLocaleDateString(LOC, { day: "numeric", month: "long" })} ${state.time}` : "";
    $("#waLink").href = "https://wa.me/77000000000?text=" + encodeURIComponent(L(`Здравствуйте! Хочу записаться: ${s}${when}`, `Hello! I'd like to book: ${s}${when}`));
  });

  renderDates();

  /* ---------------- прочее ---------------- */
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
})();
