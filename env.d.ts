/* eslint-disable */
// Environment types for Study Buddy AI
// Uses Cloudflare Workers AI - no external API keys needed

declare namespace Cloudflare {
	interface GlobalProps {
		mainModule: typeof import("./src/server");
		durableNamespaces: "Chat";
	}
	interface Env {
		Chat: DurableObjectNamespace<import("./src/server").Chat>;
		AI: Ai;
	}
}
interface Env extends Cloudflare.Env {}
