import type { Permission } from "./permissions";
import type { ChannelType } from "./types";

/**
 * Ready-made layouts a new server can start from: categories with their channels, the roles, and a welcome screen.
 * Shared by the create dialog (to preview them) and the server (to build them). Everything is ordinary afterwards:
 * the owner can rename, move or delete any of it.
 */

export interface TemplateRole {
  /** How channels in the template refer to the role. */
  key: string;
  name: string;
  color: string;
  permissions: Permission[];
}

export interface TemplateChannel {
  name: string;
  type: ChannelType;
  announcement?: boolean;
  /** Keys of the roles that write here; set, the channel is read-only for everyone else. */
  postRoles?: string[];
  /** Seconds between each person's messages. */
  slowmode?: number;
}

export interface TemplateCategory {
  /** Null for the channels above every category. */
  name: string | null;
  channels: TemplateChannel[];
}

export interface ServerTemplate {
  id: string;
  name: string;
  hint: string;
  /** A lucide icon name, matched in the dialog. */
  icon: "sparkles" | "gamepad" | "school" | "home" | "users";
  /** Null keeps the app's standard roles. Listed strongest first. */
  roles: TemplateRole[] | null;
  categories: TemplateCategory[];
  welcome?: { title: string; message: string; rules: string[] };
}

const ADMIN: Permission[] = ["server:manage", "channel:manage", "channel:view_private", "member:moderate", "message:delete_any", "message:pin", "message:mention_everyone", "event:manage"];

export const SERVER_TEMPLATES: ServerTemplate[] = [
  {
    id: "blank",
    name: "ساده",
    hint: "یک کانال متنی و یک اتاق صوتی؛ بقیه را خودتان می‌سازید",
    icon: "sparkles",
    roles: null,
    categories: [{ name: null, channels: [{ name: "عمومی", type: "text" }, { name: "اتاق صوتی", type: "voice" }] }],
  },
  {
    id: "gaming",
    name: "گیمینگ",
    hint: "لابی، اتاق‌های تیمی، هم‌تیمی‌یابی و کلیپ",
    icon: "gamepad",
    roles: [
      { key: "admin", name: "مدیر", color: "#38bdf8", permissions: ADMIN },
      { key: "mod", name: "ناظر", color: "#a78bfa", permissions: ["member:moderate", "message:delete_any", "message:pin"] },
      { key: "streamer", name: "استریمر", color: "#f472b6", permissions: ["event:manage", "message:mention_everyone"] },
      { key: "pro", name: "حرفه‌ای", color: "#fbbf24", permissions: [] },
      { key: "gamer", name: "گیمر", color: "#34d399", permissions: [] },
    ],
    categories: [
      {
        name: "اطلاعات",
        channels: [
          { name: "اطلاعیه‌ها", type: "text", announcement: true },
          { name: "قوانین", type: "text", announcement: true },
        ],
      },
      {
        name: "گفت‌وگو",
        channels: [
          { name: "عمومی", type: "text" },
          { name: "هم‌تیمی-یابی", type: "text", slowmode: 60 },
          { name: "کلیپ-و-اسکرین‌شات", type: "text", slowmode: 30 },
          { name: "میم", type: "text" },
        ],
      },
      {
        name: "صوتی",
        channels: [
          { name: "لابی", type: "voice" },
          { name: "تیم ۱", type: "voice" },
          { name: "تیم ۲", type: "voice" },
          { name: "استریم", type: "voice" },
        ],
      },
    ],
    welcome: {
      title: "خوش اومدی به جمع گیمرها!",
      message: "اول قوانین را بخوان، بعد توی «هم‌تیمی-یابی» تیمت را پیدا کن و بیا لابی.",
      rules: ["به همه احترام بگذار؛ فحش و توهین ممنوع.", "تقلب، هک و فروش اکانت ممنوع است.", "تبلیغ سرور یا کانال دیگر فقط با اجازهٔ مدیر."],
    },
  },
  {
    id: "class",
    name: "کلاس درس",
    hint: "اطلاعیهٔ استاد، پرسش و پاسخ، تمرین، منابع و کلاس آنلاین",
    icon: "school",
    roles: [
      { key: "teacher", name: "استاد", color: "#fbbf24", permissions: ADMIN },
      { key: "ta", name: "دستیار آموزشی", color: "#38bdf8", permissions: ["member:moderate", "message:delete_any", "message:pin", "event:manage", "message:mention_everyone"] },
      { key: "rep", name: "نمایندهٔ کلاس", color: "#a78bfa", permissions: ["message:pin"] },
      { key: "student", name: "دانشجو", color: "#34d399", permissions: [] },
    ],
    categories: [
      {
        name: "اطلاعات کلاس",
        channels: [
          { name: "اطلاعیه‌ها", type: "text", announcement: true, postRoles: ["ta"] },
          { name: "برنامهٔ-کلاس", type: "text", postRoles: ["ta"] },
          { name: "منابع-و-جزوه", type: "text", postRoles: ["ta", "rep"] },
        ],
      },
      {
        name: "درس",
        channels: [
          { name: "پرسش-و-پاسخ", type: "text", slowmode: 30 },
          { name: "تمرین‌ها", type: "text" },
          { name: "گپ-دانشجویی", type: "text" },
        ],
      },
      {
        name: "صوتی",
        channels: [
          { name: "کلاس آنلاین", type: "voice" },
          { name: "اتاق مطالعه", type: "voice" },
          { name: "رفع اشکال", type: "voice" },
        ],
      },
    ],
    welcome: {
      title: "به کلاس خوش آمدید",
      message: "اطلاعیه‌ها و برنامهٔ کلاس را دنبال کنید. سؤال‌های درسی را در «پرسش-و-پاسخ» بپرسید.",
      rules: ["سؤال‌ها را در کانال پرسش و پاسخ بپرسید، نه در پیام خصوصی استاد.", "پاسخ تمرین‌ها را پیش از مهلت در کانال تمرین‌ها نفرستید.", "در کلاس آنلاین میکروفون خود را تا زمان صحبت ببندید."],
    },
  },
  {
    id: "family",
    name: "خانواده",
    hint: "گپ خانوادگی، عکس‌ها، دورهمی صوتی و سینمای خانگی",
    icon: "home",
    roles: [
      { key: "elder", name: "بزرگ‌تر خانواده", color: "#fbbf24", permissions: ADMIN },
      { key: "parent", name: "پدر و مادر", color: "#fb7185", permissions: ["member:moderate", "message:delete_any", "message:pin", "event:manage", "message:mention_everyone"] },
      { key: "kid", name: "بچه‌ها", color: "#34d399", permissions: [] },
    ],
    categories: [
      {
        name: null,
        channels: [
          { name: "خبرهای-خانواده", type: "text", announcement: true, postRoles: ["parent"] },
          { name: "گپ-خانوادگی", type: "text" },
          { name: "عکس‌ها-و-خاطره‌ها", type: "text" },
          { name: "دستور-پخت", type: "text" },
          { name: "تولدها-و-مناسبت‌ها", type: "text" },
        ],
      },
      {
        name: "دورهمی",
        channels: [
          { name: "دورهمی", type: "voice" },
          { name: "سینمای خانگی", type: "cinema" },
        ],
      },
    ],
  },
  {
    id: "friends",
    name: "دوستان",
    hint: "پاتوق دوستانه با گپ، برنامه‌ریزی، بازی و تماشای فیلم",
    icon: "users",
    roles: null,
    categories: [
      {
        name: "پاتوق",
        channels: [
          { name: "گپ", type: "text" },
          { name: "برنامه‌ریزی", type: "text" },
          { name: "لینک-و-میم", type: "text" },
        ],
      },
      {
        name: "صوتی",
        channels: [
          { name: "پاتوق صوتی", type: "voice" },
          { name: "بازی", type: "voice" },
          { name: "سینما", type: "cinema" },
        ],
      },
    ],
  },
];

export const findTemplate = (id: string | undefined) => SERVER_TEMPLATES.find((t) => t.id === id) ?? SERVER_TEMPLATES[0];
