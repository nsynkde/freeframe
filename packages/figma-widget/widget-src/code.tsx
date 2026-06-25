/// <reference types="@figma/plugin-typings" />
/// <reference types="@figma/widget-typings" />

const { widget } = figma;
const { useSyncedState, usePropertyMenu, waitForTask, AutoLayout, Text, Rectangle, Image } = widget;

function FreeframeWidget() {
  const [assetUrl, setAssetUrl] = useSyncedState('assetUrl', '');
  const [assetName, setAssetName] = useSyncedState('assetName', '');
  const [thumbnailBase64, setThumbnailBase64] = useSyncedState('thumbnailBase64', '');
  const [cardWidth, setCardWidth] = useSyncedState('cardWidth', 280);
  const [version, setVersion] = useSyncedState<number | null>('version', null);
  const [uploadedAt, setUploadedAt] = useSyncedState('uploadedAt', '');

  const thumbHeight = Math.round(cardWidth * 9 / 16);

  function openSetup() {
    return waitForTask(
      new Promise<void>((resolve) => {
        figma.showUI(__html__, { width: 420, height: 520, title: 'Freeframe' });
        figma.ui.postMessage({ type: 'init', assetUrl, assetName, mode: 'setup' });
        figma.ui.onmessage = (msg: {
          type: string;
          url?: string;
          name?: string;
          thumbnailBase64?: string;
          version?: number | null;
          uploadedAt?: string;
        }) => {
          if (msg.type === 'save' && msg.url) {
            console.log('[freeframe-widget] save received:', msg);
            setAssetUrl(msg.url);
            setAssetName(msg.name ?? '');
            setThumbnailBase64(msg.thumbnailBase64 ?? '');
            setVersion(msg.version ?? null);
            setUploadedAt(msg.uploadedAt ?? '');
          }
          figma.closePlugin();
          resolve();
        };
      }),
    );
  }

  function applyPluginSync() {
    return waitForTask(new Promise<void>((resolve) => {
      console.log('[freeframe-widget] applyPluginSync triggered');
      // When property menu fires the widget is selected — that's this widget's node
      const self = figma.currentPage.selection[0] as WidgetNode | undefined;
      console.log('[freeframe-widget] self node:', self?.id, self?.type);
      const raw = self?.getSharedPluginData('freeframe', 'syncState');
      console.log('[freeframe-widget] raw syncState:', raw);
      if (raw) {
        try {
          const s = JSON.parse(raw) as Record<string, unknown>;
          console.log('[freeframe-widget] parsed state:', s);
          if (s.assetUrl) setAssetUrl(s.assetUrl as string);
          if (s.assetName !== undefined) setAssetName(s.assetName as string);
          if (s.thumbnailBase64 !== undefined) setThumbnailBase64(s.thumbnailBase64 as string);
          if (s.version !== undefined) setVersion(s.version as number | null);
          if (s.uploadedAt !== undefined) setUploadedAt(s.uploadedAt as string);
          console.log('[freeframe-widget] state applied');
        } catch (e) {
          console.log('[freeframe-widget] parse error:', e);
        }
      } else {
        console.log('[freeframe-widget] no syncState found on node');
      }
      resolve();
    }));
  }

  usePropertyMenu(
    [
      { itemType: 'action', tooltip: 'Change Asset', propertyName: 'change' },
      { itemType: 'action', tooltip: 'Refresh from Freeframe', propertyName: 'refresh' },
      {
        itemType: 'dropdown',
        propertyName: 'size',
        tooltip: 'Size',
        selectedOption: String(cardWidth),
        options: [
          { option: '200', label: 'S' },
          { option: '280', label: 'M' },
          { option: '400', label: 'L' },
          { option: '560', label: 'XL' },
        ],
      },
    ],
    ({ propertyName, propertyValue }) => {
      if (propertyName === 'change') return openSetup();
      if (propertyName === 'refresh') return applyPluginSync();
      if (propertyName === 'size') setCardWidth(Number(propertyValue));
    },
  );

  if (!assetUrl) {
    return (
      <AutoLayout
        width={cardWidth}
        height={thumbHeight}
        fill="#111118"
        cornerRadius={8}
        horizontalAlignItems="center"
        verticalAlignItems="center"
        direction="vertical"
        spacing={8}
        onClick={() => openSetup()}
      >
        <Text fill="#6B7280" fontSize={12} fontFamily="Inter">
          Click to add Freeframe asset
        </Text>
      </AutoLayout>
    );
  }

  const meta = [
    version !== null ? 'v' + version : '',
    uploadedAt,
  ].filter(Boolean).join(' · ');

  return (
    <AutoLayout
      direction="vertical"
      width={cardWidth}
      fill="#111118"
      cornerRadius={8}
      onClick={() => { figma.openExternal(assetUrl); }}
    >
      {thumbnailBase64
        ? <Image src={thumbnailBase64} width={cardWidth} height={thumbHeight} />
        : <Rectangle width={cardWidth} height={thumbHeight} fill="#1C1C2E" />
      }
      <AutoLayout
        direction="vertical"
        padding={{ top: 10, bottom: 10, left: 12, right: 12 }}
        spacing={4}
        width="fill-parent"
      >
        <Text fontSize={13} fontWeight={600} fill="#F9FAFB" fontFamily="Inter" width="fill-parent">
          {assetName || 'Freeframe Asset'}
        </Text>
        {meta
          ? <Text fontSize={11} fill="#6B7280" fontFamily="Inter">{meta}</Text>
          : <Text fontSize={11} fill="#6B7280" fontFamily="Inter">Click to open</Text>
        }
      </AutoLayout>
    </AutoLayout>
  );
}

widget.register(FreeframeWidget);
