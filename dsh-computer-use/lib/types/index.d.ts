/**
 * dsh-computer-use host half: registers the `computer-use` settings namespace
 * and the desktop-control tools. Screenshots are persisted as DSH
 * attachments so a vision model (dsh-vision-model) can analyze them.
 * @module
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "dsh-computer-use";
/** Services required by this plugin. */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
