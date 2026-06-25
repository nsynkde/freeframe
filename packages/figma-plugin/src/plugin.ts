const STORAGE_KEY = 'ff_config';
const FREEFRAME_WIDGET_ID = 'widget-id-th389E0O4K';

figma.showUI(__html__, { width: 380, height: 600, title: 'Freeframe' });

figma.ui.onmessage = async (msg: { type: string; id?: number; value?: unknown; url?: string; opts?: RequestInit; headers?: Record<string, string>; updates?: { nodeId: string; state: Record<string, unknown> }[]; creates?: { state: Record<string, unknown> }[] }) => {
  switch (msg.type) {
    case 'get-config': {
      const value = await figma.clientStorage.getAsync(STORAGE_KEY);
      figma.ui.postMessage({ type: 'config', value: value ?? null });
      break;
    }
    case 'set-config': {
      await figma.clientStorage.setAsync(STORAGE_KEY, msg.value);
      break;
    }
    case 'clear-config': {
      await figma.clientStorage.deleteAsync(STORAGE_KEY);
      figma.ui.postMessage({ type: 'config-cleared' });
      break;
    }
    case 'api-request': {
      const url = msg.url;
      if (!url || typeof url !== 'string') {
        figma.ui.postMessage({ type: 'api-response', id: msg.id, ok: false, status: 0, error: 'Missing URL — reconnect the plugin' });
        break;
      }
      try {
        const opts = msg.opts as { method?: string; headers?: Record<string, string>; body?: string } | undefined;
        const res = await fetch(url, {
          method: opts?.method ?? 'GET',
          headers: opts?.headers ?? {},
          body: opts?.body,
        });
        const data = await res.json();
        figma.ui.postMessage({ type: 'api-response', id: msg.id, ok: res.ok, status: res.status, data });
      } catch (err) {
        figma.ui.postMessage({ type: 'api-response', id: msg.id, ok: false, status: 0, error: String(err) });
      }
      break;
    }
    case 'api-request-binary': {
      // Returns a base64 data URL instead of JSON — used for image thumbnails
      const url = msg.url;
      if (!url || typeof url !== 'string') {
        figma.ui.postMessage({ type: 'api-response', id: msg.id, ok: false, status: 0, data: null });
        break;
      }
      try {
        const res = await fetch(url, { headers: (msg.headers ?? {}) as HeadersInit });
        if (!res.ok) {
          figma.ui.postMessage({ type: 'api-response', id: msg.id, ok: false, status: res.status, data: null });
          break;
        }
        const buffer = await res.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const ct = res.headers.get('content-type') ?? 'image/jpeg';
        figma.ui.postMessage({ type: 'api-response', id: msg.id, ok: true, data: `data:${ct};base64,${btoa(binary)}` });
      } catch (err) {
        figma.ui.postMessage({ type: 'api-response', id: msg.id, ok: false, status: 0, error: String(err) });
      }
      break;
    }
    case 'scan-widgets': {
      const nodes = figma.currentPage.findAllWithCriteria({ types: ['WIDGET'] }) as WidgetNode[];
      const widgets = nodes
        .filter(n => n.widgetId === FREEFRAME_WIDGET_ID)
        .map(n => {
          let syncedState: Record<string, unknown> = n.widgetSyncedState as Record<string, unknown>;
          // widgetSyncedState is empty when setWidgetSyncedStateAsync isn't available (e.g. FigJam)
          // Fall back to shared plugin data written by the sync plugin
          if (!syncedState.assetUrl) {
            const stored = n.getSharedPluginData('freeframe', 'syncState');
            if (stored) {
              try { syncedState = JSON.parse(stored); } catch {}
            }
          }
          return { nodeId: n.id, assetUrl: (syncedState.assetUrl as string) ?? '', syncedState };
        });
      figma.ui.postMessage({ type: 'widget-scan', widgets });
      break;
    }
    case 'apply-sync': {
      const updates = msg.updates ?? [];
      const creates = msg.creates ?? [];
      let updated = 0, created = 0;

      try {
        // Capture template BEFORE updates so clones are made from an unmodified widget
        const allWidgets = (figma.currentPage.findAllWithCriteria({ types: ['WIDGET'] }) as WidgetNode[])
          .filter(n => n.widgetId === FREEFRAME_WIDGET_ID);

        if (creates.length > 0 && allWidgets.length === 0) {
          figma.ui.postMessage({ type: 'sync-done', updated, created: 0, needsWidget: creates.length });
          break;
        }

        // Find the best template: prefer a widget NOT in the updates list so its state is untouched
        const updateNodeIds = new Set(updates.map(u => u.nodeId));
        const template = (allWidgets.find(n => !updateNodeIds.has(n.id)) ?? allWidgets[allWidgets.length - 1]) as WidgetNode;

        const CARD_W = 280, CARD_H = 218, GAP = 24, COLS = 4;
        const startX = Math.max(...allWidgets.map(n => n.x + n.width)) + GAP * 2;
        const startY = Math.min(...allWidgets.map(n => n.y));

        // Create all clones BEFORE applying updates — clones inherit clean template state
        const clones: Array<{ node: WidgetNode; state: Record<string, unknown> }> = [];
        for (let i = 0; i < creates.length; i++) {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          const clone = template.clone() as WidgetNode;
          clone.x = startX + col * (CARD_W + GAP);
          clone.y = startY + row * (CARD_H + GAP);
          clones.push({ node: clone, state: creates[i].state });
        }

        // Apply updates to existing widgets
        for (const u of updates) {
          const node = figma.getNodeById(u.nodeId);
          if (!node || node.type !== 'WIDGET') continue;
          node.setSharedPluginData('freeframe', 'syncState', JSON.stringify(u.state));
          if (typeof (node as any).setWidgetSyncedStateAsync === 'function') {
            await (node as any).setWidgetSyncedStateAsync(u.state);
          }
          updated++;
        }

        // Apply state to clones
        for (const { node, state } of clones) {
          node.setSharedPluginData('freeframe', 'syncState', JSON.stringify(state));
          if (typeof (node as any).setWidgetSyncedStateAsync === 'function') {
            await (node as any).setWidgetSyncedStateAsync(state);
          }
          created++;
        }

        figma.ui.postMessage({ type: 'sync-done', updated, created });
      } catch (err) {
        figma.ui.postMessage({ type: 'sync-done', updated, created, error: String(err) });
      }
      break;
    }
  }
};
