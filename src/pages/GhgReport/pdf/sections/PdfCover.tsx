

import { Page, Text, View, Image } from "@react-pdf/renderer";

export default function PdfCover({
  companyName,
  reportingLine,
  publishedLine,
  logoSrc,       // optional: base64 or URL for company logo
  coverImageSrc, // optional: base64 or URL for bottom-right background image
}: {
  companyName: string;
  reportingLine: string;
  publishedLine: string;
  logoSrc?: string;
  coverImageSrc?: string;
}) {
  return (
    <Page
      size="A4"
      style={{
        paddingTop: 0,
        paddingBottom: 0,
        paddingHorizontal: 0,
        backgroundColor: "#ffffff",
        fontFamily: "Helvetica",
      }}
    >
      {/* ── TOP-LEFT corner accent L-shape ── */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 28,
          height: 88,
          backgroundColor: "#0b2a4a",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 88,
          height: 28,
          backgroundColor: "#0b2a4a",
        }}
      />

      {/* ── TOP-RIGHT thin accent stripe ── */}
      <View
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 5,
          height: 210,
          backgroundColor: "#1a9de0",
        }}
      />

      {/* ── BOTTOM-RIGHT image with curved top-left ── */}
      {coverImageSrc ? (
        <View
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 265,
            height: 225,
            overflow: "hidden",
            borderTopLeftRadius: 132,
          }}
        >
          <Image
            src={coverImageSrc}
            style={{ width: 265, height: 225, objectFit: "cover" }}
          />
        </View>
      ) : (
        /* Fallback shape if no image provided */
        <>
          <View
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 265,
              height: 225,
              backgroundColor: "#b8dff2",
              borderTopLeftRadius: 132,
            }}
          />
          <View
            style={{
              position: "absolute",
              right: 30,
              bottom: 30,
              width: 200,
              height: 160,
              backgroundColor: "#daeef9",
              borderTopLeftRadius: 100,
            }}
          />
        </>
      )}

      {/* ── BOTTOM-LEFT small accent block ── */}
      <View
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: 42,
          height: 72,
          backgroundColor: "#1a9de0",
        }}
      />

      {/* ── MAIN CONTENT ── */}
      <View style={{ paddingTop: 58, paddingHorizontal: 54 }}>

        {/* Logo area */}
        {logoSrc ? (
          <Image
            src={logoSrc}
            style={{ width: 120, height: 90, objectFit: "contain", marginBottom: 36 }}
          />
        ) : (
          /* Placeholder when no logo — just leave tasteful space */
          <View style={{ marginBottom: 52 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: "#0b2a4a",
                letterSpacing: 3,
              }}
            >
              {companyName?.toUpperCase()}
            </Text>
            <View
              style={{
                width: 36,
                height: 2,
                backgroundColor: "#1a9de0",
                marginTop: 5,
                borderRadius: 1,
              }}
            />
          </View>
        )}

        {/* ── TITLE ── */}
        <Text
          style={{
            fontSize: 36,
            fontWeight: 900,
            color: "#0b2a4a",
            lineHeight: 1.15,
            letterSpacing: 0.5,
            marginBottom: 24,
          }}
        >
          {"CARBON\nACCOUNTING REPORT"}
        </Text>

        {/* Reporting period & date */}
        <Text style={{ fontSize: 12, color: "#1a3d5c", marginBottom: 6 }}>
          {reportingLine}
        </Text>
        <Text style={{ fontSize: 12, color: "#1a3d5c", marginBottom: 28 }}>
          {publishedLine}
        </Text>

        {/* Blue divider rule */}
        <View
          style={{
            height: 1.5,
            backgroundColor: "#1a9de0",
            marginBottom: 28,
          }}
        />

        {/* Prepared for */}
        <Text
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#0b2a4a",
            marginBottom: 7,
          }}
        >
          Prepared for:
        </Text>
        <Text
          style={{
            fontSize: 16,
            fontWeight: 900,
            color: "#0b2a4a",
            letterSpacing: 0.4,
          }}
        >
          {companyName}
        </Text>
      </View>

      {/* ── FOOTER ── */}
      <View
        style={{
          position: "absolute",
          bottom: 20,
          left: 54,
          right: 54,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 8, color: "#94b8cc", letterSpacing: 1.2 }}>
          {companyName?.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 8, color: "#94b8cc", letterSpacing: 1.2 }}>
          COVER
        </Text>
      </View>
    </Page>
  );
}