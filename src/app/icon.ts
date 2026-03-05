export const size = {
	width: 32,
	height: 32,
};

export const contentType = "image/svg+xml";

const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect x="7" y="3" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="12" y="3" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="17" y="3" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="3" y="7" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="21" y="7" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="3" y="11" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="3" y="15" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="3" y="19" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="3" y="23" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="21" y="23" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="7" y="27" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="12" y="27" width="4" height="3" rx="0.5" fill="#C26A3A"/>
  <rect x="17" y="27" width="4" height="3" rx="0.5" fill="#C26A3A"/>
</svg>`;

export default function Icon() {
	return new Response(ICON_SVG.trim(), {
		headers: {
			"Content-Type": contentType,
			"Cache-Control": "public, immutable, max-age=31536000",
		},
	});
}
