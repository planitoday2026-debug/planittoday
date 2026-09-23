# Images and destination sources

## In-page images

- **Kakolem Beach, Goa** — Chirayu Sharma. [Unsplash source](https://unsplash.com/photos/a-view-of-a-tropical-beach-with-palm-trees-M5AR9jscKgM). Used under the [Unsplash License](https://unsplash.com/license). The photo does not establish a particular time of day.
- **Daigo-ji in autumn, Kyoto** — ChubbyWimbus. [Wikimedia Commons source and public-domain declaration](https://commons.wikimedia.org/wiki/File:Daigo-ji_in_autumn,_Kyoto.jpg).

Images are stored under `public/images/`. The compass favicon is original simple SVG geometry. Icons use lucide-react. Typography uses DM Sans and Manrope via Google Fonts, with local system fallbacks.

## Official destination references

- [Goa Tourism Development Corporation](https://goa-tourism.com/)
- [Rajasthan Tourism: Jaipur](https://www.tourism.rajasthan.gov.in/jaipur.html)
- [Kerala Tourism](https://www.keralatourism.org/destination/)
- [Kyoto City Tourism](https://kyoto.travel/en/destinations)

These references support place context. They do not verify future hours, closures, prices, accessibility or inventory. The UI labels these limits.

## AI integration reference

[Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs). The optional local adapter uses `/api/chat`, a JSON schema in `format`, a downloaded model selected by environment configuration, and server-side output validation. Default preview mode does not contact a model.

The fonts use system fallbacks in this portable edition. Images are bundled in `public/images`; there are no required remote font or image requests.
