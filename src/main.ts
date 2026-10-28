import "@fontsource-variable/fredoka";
import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { sound } from "./audio";
import { Board } from "./board";
import { fx } from "./fx";
import { haptics } from "./haptics";
import { icons } from "./icons";
import { importPhoto, pickFiles } from "./importPhoto";
import { deletePhoto, listPhotos, requestPersistence, savePhoto } from "./storage";

registerSW({ immediate: true });

const app = document.querySelector<HTMLDivElement>("#app")!;
const GRIDS = [2, 3, 4, 5];
const GRID_KEY = "pictureslide.grid";

interface Picture {
  id: string;
  thumb: string; // URL for gallery thumbnails
  photo: boolean; // user photo (deletable) vs built-in starter
  load: () => Promise<{ url: string; release: () => void }>;
}

// ---- Global input hygiene -------------------------------------------------------

// Audio can only start from a user gesture; unlock on the very first touch anywhere.
for (const type of ["pointerdown", "touchend", "click"]) {
  addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
}
addEventListener("contextmenu", (e) => e.preventDefault());
// Pressed-state squish for anything button-like, with a soft click.
addEventListener("pointerdown", (e) => {
  const btn = (e.target as Element).closest?.("button");
  if (btn && !btn.disabled && !btn.classList.contains("silent")) {
    sound.button();
    haptics.tap();
  }
});

// ---- Pictures -------------------------------------------------------------------

const STARTERS = ["farm", "sea", "space"];
const rasterCache = new Map<string, string>();

/** Starter art is SVG; rasterise once so 25 pieces aren't each re-rendering vectors. */
async function rasterise(src: string): Promise<string> {
  const cached = rasterCache.get(src);
  if (cached) return cached;
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1536;
  canvas.getContext("2d")!.drawImage(img, 0, 0, 1536, 1536);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.92));
  const url = URL.createObjectURL(blob);
  rasterCache.set(src, url);
  return url;
}

let galleryUrls: string[] = [];

async function loadPictures(): Promise<Picture[]> {
  galleryUrls.forEach(URL.revokeObjectURL);
  galleryUrls = [];
  const photos = await listPhotos().catch(() => []);
  const userPictures: Picture[] = photos.map((p) => {
    const thumb = URL.createObjectURL(p.thumb);
    galleryUrls.push(thumb);
    return {
      id: p.id,
      thumb,
      photo: true,
      load: async () => {
        const url = URL.createObjectURL(p.image);
        return { url, release: () => URL.revokeObjectURL(url) };
      },
    };
  });
  const starters: Picture[] = STARTERS.map((name) => {
    const src = `${import.meta.env.BASE_URL}starters/${name}.svg`;
    return { id: name, thumb: src, photo: false, load: async () => ({ url: await rasterise(src), release: () => {} }) };
  });
  return [...userPictures, ...starters];
}

// ---- Screens --------------------------------------------------------------------

let cleanup: () => void = () => {};

function mount(html: string): HTMLElement {
  cleanup();
  cleanup = () => {};
  fx.clear();
  app.innerHTML = html;
  return app.firstElementChild as HTMLElement;
}

const h = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const tilt = (i: number) => (((i * 37) % 7) - 3) * 0.7;

function titleHtml() {
  const colors = ["#ff5f8f", "#ff7a59", "#ffb020", "#2ec4b6", "#4f8bff", "#8b5cf6"];
  return [..."PictureSlide"]
    .map((ch, i) => `<span style="color:${colors[i % colors.length]};--i:${i}">${ch}</span>`)
    .join("");
}

async function showHome(editing = false) {
  const pictures = await loadPictures();
  const root = mount(`
    <main class="screen home ${editing ? "editing" : ""}">
      <header class="topbar">
        <h1 class="title" aria-label="PictureSlide">${titleHtml()}</h1>
        <div class="tools">
          <button class="icon-btn mute" aria-label="Sound">${sound.muted ? icons.soundOff : icons.soundOn}</button>
          ${
            editing
              ? `<button class="icon-btn done" aria-label="Done">${icons.check}</button>`
              : `<button class="icon-btn hold edit silent" aria-label="Hold to edit">${icons.pencil}<i class="ring"></i></button>`
          }
        </div>
      </header>
      <div class="gallery">
        <div class="card-wrap" style="--tilt:${tilt(0)}deg">
          <button class="card add">
            <span class="add-icon">${icons.plus}</span>
            <span class="add-label">Add photos</span>
          </button>
        </div>
        ${pictures
          .map(
            (p, i) => `
          <div class="card-wrap" style="--tilt:${tilt(i + 1)}deg; --delay:${Math.min(i, 12) * 40}ms">
            <button class="card picture" data-id="${h(p.id)}"><img src="${h(p.thumb)}" alt="" draggable="false"></button>
            ${p.photo ? `<button class="delete" data-id="${h(p.id)}" aria-label="Delete">${icons.close}</button>` : ""}
          </div>`,
          )
          .join("")}
      </div>
    </main>`);

  root.querySelector(".mute")!.addEventListener("click", () => {
    sound.setMuted(!sound.muted);
    root.querySelector(".mute")!.innerHTML = sound.muted ? icons.soundOff : icons.soundOn;
  });
  root.querySelector(".done")?.addEventListener("click", () => showHome(false));

  // Parent-only edit mode: press and hold, so small fingers don't stumble into it.
  const edit = root.querySelector<HTMLButtonElement>(".edit");
  if (edit) {
    let timer = 0;
    const cancel = () => {
      clearTimeout(timer);
      edit.classList.remove("holding");
    };
    edit.addEventListener("pointerdown", () => {
      edit.classList.add("holding");
      timer = window.setTimeout(() => {
        haptics.lift();
        sound.button();
        showHome(true);
      }, 900);
    });
    edit.addEventListener("pointerup", cancel);
    edit.addEventListener("pointerleave", cancel);
    edit.addEventListener("pointercancel", cancel);
  }

  root.querySelector(".add")!.addEventListener("click", async () => {
    const files = await pickFiles();
    if (!files.length) return;
    requestPersistence();
    const add = root.querySelector(".add")!;
    add.classList.add("busy");
    for (const f of files) {
      try {
        await savePhoto(await importPhoto(f));
      } catch (err) {
        console.warn("Couldn't import", f.name, err);
      }
    }
    showHome(editing);
  });

  root.querySelectorAll<HTMLButtonElement>(".delete").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await deletePhoto(btn.dataset.id!);
      showHome(true);
    }),
  );

  root.querySelectorAll<HTMLButtonElement>(".card.picture").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (root.classList.contains("editing")) return;
      const pic = pictures.find((p) => p.id === btn.dataset.id)!;
      showLevels(pic);
    }),
  );
}

function showLevels(pic: Picture) {
  const last = Number(localStorage.getItem(GRID_KEY)) || 3;
  const sheet = document.createElement("div");
  sheet.className = "sheet-backdrop";
  sheet.innerHTML = `
    <div class="sheet">
      <button class="icon-btn close" aria-label="Close">${icons.close}</button>
      <div class="levels">
        ${GRIDS.map(
          (n) => `
          <button class="level ${n === last ? "last" : ""}" data-grid="${n}" style="--n:${n}">
            <span class="mini">${Array.from({ length: n * n }, (_, i) => `<i style="--c:${i % n};--r:${Math.floor(i / n)}"></i>`).join("")}</span>
            <span class="count">${n * n}</span>
          </button>`,
        ).join("")}
      </div>
    </div>`;
  sheet.style.setProperty("--thumb", `url("${pic.thumb}")`);
  app.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add("open"));

  const close = () => {
    sheet.classList.remove("open");
    setTimeout(() => sheet.remove(), 250);
  };
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) close();
  });
  sheet.querySelector(".close")!.addEventListener("click", close);
  sheet.querySelectorAll<HTMLButtonElement>(".level").forEach((b) =>
    b.addEventListener("click", () => {
      const grid = Number(b.dataset.grid);
      localStorage.setItem(GRID_KEY, String(grid));
      sheet.remove();
      startGame(pic, grid);
    }),
  );
}

async function startGame(pic: Picture, grid: number) {
  if (history.state?.screen !== "game") history.pushState({ screen: "game" }, "");
  const { url, release } = await pic.load();
  const root = mount(`
    <main class="screen game">
      <div class="game-bar">
        <button class="icon-btn home-btn" aria-label="Home">${icons.home}</button>
        <button class="peek silent" aria-label="Peek"><img src="${h(pic.thumb)}" alt="" draggable="false"></button>
      </div>
      <div class="board-host"></div>
    </main>`);

  const host = root.querySelector<HTMLElement>(".board-host")!;
  const board = new Board({ image: url, grid, host, onSolved: () => showWin() });
  board.start();

  // Hold the little picture to see the whole thing over the board.
  const peek = root.querySelector<HTMLButtonElement>(".peek")!;
  const showPeek = (on: boolean) => {
    if (on === board.el.classList.contains("peeking")) return;
    board.el.classList.toggle("peeking", on);
    if (on) sound.lift();
  };
  peek.addEventListener("pointerdown", (e) => {
    peek.setPointerCapture(e.pointerId);
    showPeek(true);
  });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) peek.addEventListener(t, () => showPeek(false));

  root.querySelector(".home-btn")!.addEventListener("click", () => history.back());

  let wakeLock: { release(): Promise<void> } | undefined;
  (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<typeof wakeLock> } }).wakeLock
    ?.request("screen")
    .then((l) => (wakeLock = l))
    .catch(() => {});

  cleanup = () => {
    board.destroy();
    release();
    wakeLock?.release().catch(() => {});
  };

  function showWin() {
    const win = document.createElement("div");
    win.className = "win";
    win.innerHTML = `
      <button class="big-btn again" aria-label="Play again">${icons.again}</button>
      ${grid < 5 ? `<button class="big-btn harder" aria-label="More pieces">${icons.harder}<b>${(grid + 1) ** 2}</b></button>` : ""}
      <button class="big-btn home" aria-label="Choose a picture">${icons.home}</button>`;
    root.appendChild(win);
    requestAnimationFrame(() => win.classList.add("show"));
    win.querySelector(".again")!.addEventListener("click", () => startGame(pic, grid));
    win.querySelector(".harder")?.addEventListener("click", () => {
      localStorage.setItem(GRID_KEY, String(grid + 1));
      startGame(pic, grid + 1);
    });
    win.querySelector(".home")!.addEventListener("click", () => history.back());
  }
}

addEventListener("popstate", () => showHome());

// Start at home; drop a stale "game" entry left over from a reload.
if (history.state?.screen === "game") history.replaceState(null, "");
showHome();
