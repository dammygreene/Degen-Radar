import { Bot, InlineKeyboard } from "grammy";
import { getConfig } from "../config";
import { renderRadarSignal } from "../domain/alerts/templates";
import { defaultUserSettings } from "../domain/users/types";
import { getProviders } from "../providers/registry";
import { scanToken } from "../services/scan-orchestrator";
import {
  addWatchedFomo,
  addWatchedWallet,
  listWatched,
  removeWatched,
} from "../services/watchlist/repo";
import { getUserByTelegramId, upsertUser } from "../services/users/repo";
import { getSystemHealth } from "../services/health";
import { logger } from "../utils/logger";
import { assertSolanaAddress, isValidHandle, normalizeHandle } from "../utils/solana-address";
import { shortenAddress } from "../utils/format";

const START_TEXT = [
  "⚡ DEGEN RADAR",
  "",
  "Solana memecoin intelligence (research-only, no trading).",
  "",
  "I watch:",
  "• low caps",
  "• wallets",
  "• FOMO traders",
  "• momentum",
  "• security",
  "• X narrative",
  "",
  "Add wallets or FOMO traders and I'll scan what they buy.",
  "",
  "Try /token <address> or /help",
].join("\n");

const HELP_TEXT = [
  "Commands:",
  "/start – intro",
  "/help – this message",
  "/token <address> – full token scan",
  "/scan – top qualifying candidates",
  "/watchwallet <address> – watch a Solana wallet",
  "/watchfomo <handle> – watch a FOMO trader",
  "/unwatch <address|handle> – stop watching",
  "/watchlist – show your watchlist",
  "/settings – show alert thresholds",
  "/status – system + provider health",
].join("\n");

async function requireUser(telegramUserId: number, username: string | null) {
  try {
    return await upsertUser(telegramUserId, username);
  } catch {
    return null;
  }
}

export function createBot(): Bot | null {
  const cfg = getConfig();
  const token = cfg.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled.");
    return null;
  }

  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    await requireUser(ctx.from!.id, ctx.from?.username ?? null);
    const kb = new InlineKeyboard()
      .text("SCAN", "scan").text("WATCHLIST", "watchlist").text("SETTINGS", "settings");
    await ctx.reply(START_TEXT, { reply_markup: kb });
  });

  bot.command("help", (ctx) => ctx.reply(HELP_TEXT));

  bot.command("token", async (ctx) => {
    const address = ctx.match?.trim();
    if (!address) return ctx.reply("Usage: /token <solana_address>");
    let parsed: string;
    try {
      parsed = assertSolanaAddress(address);
    } catch {
      return ctx.reply("❌ Invalid Solana address.");
    }
    await ctx.reply("🔎 Scanning…");
    try {
      const { result, market } = await scanToken(parsed, { reason: "MANUAL" });
      const text = renderRadarSignal(result, {
        marketCapUsd: market?.marketCapUsd,
        liquidityUsd: market?.liquidityUsd,
        ageMs: market?.pairCreatedAt ? Date.now() - market.pairCreatedAt.getTime() : null,
      });
      const kb = new InlineKeyboard()
        .url("Chart", `https://dexscreener.com/solana/${parsed}`)
        .text("Refresh", `refresh:${parsed}`)
        .text("Watch", `watchtoken:${parsed}`);
      await ctx.reply(text, { reply_markup: kb });
    } catch (err) {
      logger.error({ err, parsed }, "token scan failed");
      await ctx.reply("⚠️ Scan failed. The token may not exist or providers are degraded.");
    }
  });

  bot.command("scan", async (ctx) => {
    await ctx.reply(
      "Discovery candidates are surfaced automatically as watched wallets buy. " +
        "Use /token <address> to scan a specific token, or add wallets with /watchwallet.",
    );
  });

  bot.command("watchwallet", async (ctx) => {
    const address = ctx.match?.trim();
    if (!address) return ctx.reply("Usage: /watchwallet <solana_address>");
    const user = await requireUser(ctx.from!.id, ctx.from?.username ?? null);
    if (!user) return ctx.reply("⚠️ Database not configured — watchlists are unavailable.");
    try {
      const rec = await addWatchedWallet(user.id, address);
      await ctx.reply(
        [
          "👀 Wallet added",
          "",
          `Label: ${rec.label ?? shortenAddress(rec.walletAddress ?? address)}`,
          "",
          "You'll be notified when this wallet buys a token that passes Radar criteria.",
        ].join("\n"),
      );
    } catch {
      await ctx.reply("❌ Invalid Solana address.");
    }
  });

  bot.command("watchfomo", async (ctx) => {
    const handle = ctx.match?.trim();
    if (!handle || !isValidHandle(handle)) return ctx.reply("Usage: /watchfomo <handle>");
    const user = await requireUser(ctx.from!.id, ctx.from?.username ?? null);
    if (!user) return ctx.reply("⚠️ Database not configured — watchlists are unavailable.");
    const providers = getProviders();
    if (!providers.fomo) return ctx.reply("⚠️ FOMO provider not configured.");
    try {
      const trader = await providers.fomo.resolveTrader(normalizeHandle(handle));
      const rec = await addWatchedFomo(user.id, handle, trader.wallet, trader.profileId);
      await ctx.reply(
        [
          "👀 FOMO trader added",
          "",
          `@${rec.fomoHandle}`,
          `Solana wallet: ${trader.wallet ? shortenAddress(trader.wallet) : "unresolved"}`,
          trader.pnl30d != null ? `30D PnL: ${Math.round(trader.pnl30d)}%` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (err) {
      logger.error({ err }, "watchfomo failed");
      await ctx.reply("⚠️ Could not resolve that FOMO handle.");
    }
  });

  bot.command("unwatch", async (ctx) => {
    const arg = ctx.match?.trim();
    if (!arg) return ctx.reply("Usage: /unwatch <address|handle>");
    const user = await requireUser(ctx.from!.id, ctx.from?.username ?? null);
    if (!user) return ctx.reply("⚠️ Database not configured.");
    const removed = await removeWatched(user.id, arg);
    await ctx.reply(removed ? "✅ Removed from watchlist." : "Not found in your watchlist.");
  });

  bot.command("watchlist", async (ctx) => {
    const user = await requireUser(ctx.from!.id, ctx.from?.username ?? null);
    if (!user) return ctx.reply("⚠️ Database not configured — watchlists are unavailable.");
    const list = await listWatched(user.id);
    if (list.length === 0) return ctx.reply("Your watchlist is empty. Add with /watchwallet or /watchfomo.");
    const wallets = list.filter((e) => e.entityType === "wallet");
    const fomo = list.filter((e) => e.entityType === "fomo");
    const lines = ["WATCHLIST", ""];
    if (wallets.length) {
      lines.push("WALLETS");
      wallets.forEach((w, i) => lines.push(`${i + 1}. ${w.label ?? shortenAddress(w.walletAddress ?? "")}`));
      lines.push("");
    }
    if (fomo.length) {
      lines.push("FOMO");
      fomo.forEach((f, i) => lines.push(`${i + 1}. @${f.fomoHandle}`));
    }
    await ctx.reply(lines.join("\n"));
  });

  bot.command("settings", async (ctx) => {
    const user = await getUserByTelegramId(ctx.from!.id);
    const s = user?.settings ?? defaultUserSettings();
    await ctx.reply(
      [
        "⚙️ SETTINGS",
        "",
        `Alerts: ${s.alertEnabled ? "on" : "off"}`,
        `Min score: ${s.minScore}`,
        `Min confidence: ${s.minConfidence}%`,
        `Min liquidity: $${s.minLiquidityUsd.toLocaleString()}`,
        `MC range: $${s.minMarketCapUsd.toLocaleString()}–$${s.maxMarketCapUsd.toLocaleString()}`,
        `Convergence window: ${Math.round(s.convergenceWindowSeconds / 60)}m`,
        `Min convergence entities: ${s.convergenceMinEntities}`,
        `Max alerts/hour: ${s.maxAlertsPerHour}`,
        `X: ${s.xEnabled ? "on" : "off"}  FOMO: ${s.fomoEnabled ? "on" : "off"}`,
      ].join("\n"),
    );
  });

  bot.command("status", async (ctx) => {
    const health = await getSystemHealth();
    const lines = [
      "🩺 STATUS",
      "",
      `DB: ${health.db ? "up" : "down"}`,
      `Redis: ${health.redis ? "up" : "down"}`,
      "",
      "Providers:",
      ...health.providers.map(
        (p) => `• ${p.provider}: ${p.status} (${p.latencyMs}ms, err ${Math.round(p.errorRate * 100)}%)`,
      ),
    ];
    if (health.providers.length === 0) lines.push("• (no provider calls yet)");
    await ctx.reply(lines.join("\n"));
  });

  // Callback buttons
  bot.callbackQuery("scan", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /token <address> to scan a specific token.");
  });
  bot.callbackQuery("watchlist", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /watchlist to view your entities.");
  });
  bot.callbackQuery("settings", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Use /settings to view thresholds.");
  });
  bot.callbackQuery(/^refresh:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Refreshing…" });
    const address = ctx.match![1]!;
    try {
      const { result, market } = await scanToken(address, { reason: "MANUAL" });
      await ctx.reply(
        renderRadarSignal(result, {
          marketCapUsd: market?.marketCapUsd,
          liquidityUsd: market?.liquidityUsd,
        }),
      );
    } catch {
      await ctx.reply("⚠️ Refresh failed.");
    }
  });
  bot.callbackQuery(/^watchtoken:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("To watch entities that buy this token, add wallets via /watchwallet.");
  });

  bot.catch((err) => logger.error({ err: err.error }, "bot handler error"));

  return bot;
}
