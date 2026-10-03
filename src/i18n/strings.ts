import { defineStrings } from "../vendor/kit/i18n";

export const STRINGS = {
  en: {
    "plugin.name": "Ghostline",
    "status.on": "Ghostline: on",
    "status.off": "Ghostline: off",
    "status.ready": "Ready",
    "status.checking": "Requesting a suggestion",
    "status.toggleHint": "Click to turn off",
    "status.toggleHintOff": "Click to turn on",
    "status.lastMs": "First word after {0} ms",
    "status.noEndpoint": "No endpoint selected — click to open settings",
    "status.unreachable": "Endpoint not reachable: {0}",
    "status.empty": "Empty responses — is the model thinking?",
    "status.alwaysThinks": "This model always thinks — suggestions will be slow",
    "status.fimUnsupported": "FIM is not available for this model — using chat",
    "status.overflow": "Context too long for the model — lower the context length in the settings",
  },
  de: {
    "plugin.name": "Ghostline",
    "status.on": "Ghostline: an",
    "status.off": "Ghostline: aus",
    "status.ready": "Bereit",
    "status.checking": "Fragt einen Vorschlag an",
    "status.toggleHint": "Klicken schaltet aus",
    "status.toggleHintOff": "Klicken schaltet ein",
    "status.lastMs": "Erstes Wort nach {0} ms",
    "status.noEndpoint": "Kein Endpunkt gewählt — Klick öffnet die Einstellungen",
    "status.unreachable": "Endpunkt nicht erreichbar: {0}",
    "status.empty": "Leere Antworten — denkt das Modell?",
    "status.alwaysThinks": "Dieses Modell denkt immer — Vorschläge kommen langsam",
    "status.fimUnsupported": "FIM gibt es für dieses Modell nicht — Chat wird verwendet",
    "status.overflow": "Kontext zu lang für das Modell — Kontextlänge in den Einstellungen verringern",
  },
};

defineStrings(STRINGS);
