// utils/emailTemplate.js

// You can import directly from theme.js if running in Node:
import { theme } from "./theme.js";

export function renderEmailTemplate({
  title,
  greeting,
  body,
  buttonText,
  buttonUrl,
}) {
  const colors = theme.colors;
  const space = theme.space;
  const radius = theme.radius;
  const fonts = theme.fonts;
  const fontSizes = theme.fontSizes;

  return `
  <div style="background:${colors.surface0}; padding:${space.xl};">
    <div style="
      max-width:560px;
      margin:0 auto;
      background:${colors.surface1};
      padding:${space.xl};
      border-radius:${radius.lg};
      font-family:${fonts.body}, Arial, sans-serif;
      color:${colors.text};
      line-height:1.6;
      border:1px solid ${colors.surface3};
    ">

      <h2 style="
        margin-top:0;
        font-family:${fonts.header}, monospace;
        font-size:${fontSizes.xl};
        color:${colors.accent};
        letter-spacing:1px;
      ">
        ${title}
      </h2>

      ${
        greeting
          ? `<p style="font-size:${fontSizes.base}; margin:${space.md} 0;">
               ${greeting}
             </p>`
          : ""
      }

      <p style="font-size:${fontSizes.base}; margin:${space.lg} 0;">
        ${body}
      </p>

      ${
        buttonText && buttonUrl
          ? `
          <div style="margin:${space.xl} 0;">
            <a href="${buttonUrl}" style="
              display:inline-block;
              padding:${space.md} ${space.lg};
              background:${colors.accent};
              color:white !important;
              text-decoration:none;
              border-radius:${radius.md};
              font-size:${fontSizes.base};
              font-weight:${theme.fontWeights.bold};
            ">
              ${buttonText}
            </a>
          </div>`
          : ""
      }

      <hr style="
        margin:${space.xl} 0;
        border:none;
        border-top:1px solid ${colors.surface3};
      ">

      <p style="font-size:${fontSizes.sm}; color:${
    colors.muted
  }; text-align:center;">
        Idle.fm • The playlist app for everyone<br>
        This email was sent automatically — please do not reply.
      </p>

    </div>
  </div>

  <style>
    @media (prefers-color-scheme: dark) {
      body {
        background: ${colors.surface0} !important;
      }
      div[style*="max-width"] {
        background: ${colors.surface1} !important;
        color: ${colors.text} !important;
      }
      a {
        color: white !important;
      }
    }
  </style>
  `;
}
