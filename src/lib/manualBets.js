/**
 * Mensajes sintéticos para cubrir un caso conocido: el export de WhatsApp
 * a veces omite mensajes que el participante SÍ envió pero no se habían
 * sincronizado al momento de exportar. El mensaje es visible en la app
 * de WhatsApp pero no aparece en el JSON que sube el admin.
 *
 * Cada entrada tiene la misma forma que produce un export real
 * (Time, Display Name, Message, Phone, Message Id) más dos campos extra
 * sólo para trazabilidad:
 *   - `synthetic: true`  (marcador; no afecta el parseo)
 *   - `source: <nota>`   (motivo documentado de la inclusión manual)
 *
 * Convención de Message Id: `manual_<participant-snake>_<YYYY-MM-DD>_<NNN>`
 * para que las filas inyectadas sean identificables en Sheets y en
 * `originalMessage` sin ambigüedad.
 *
 * Cuándo agregar una entrada: SOLO cuando el participante confirme que
 * sí envió el mensaje y este sea visible en la app de WhatsApp pero
 * ausente del JSON subido.
 *
 * El flujo de inyección vive en `parser.js → parseManualBets()`, llamado
 * desde `App.svelte refreshFromSheets` y `DropZone.svelte handleFile`.
 * Una vez que las apuestas se persisten en Sheets vía UPSERT, sobreviven
 * aunque se elimine la entrada de este array (sirve de backfill si
 * Sheets se borra o se reinicia el spreadsheet).
 * @type {Array<Object>}
 */
export const MANUAL_BETS = [
    {
        Time: '2026/6/19 12:00:00',
        'Formatted Name': '+57 310 5218554',
        'Display Name': 'mleandro0210',
        Message: 'Estados unidos 3 Australia 0\nEscocia 0 Marruecos 2\nBrasil 4 Haiti 0\nTurquia 0 Paraguay 2',
        Caption: '',
        Type: 'chat',
        Phone: '+57 310 5218554',
        'Message Id': 'manual_mleandro0210_2026-06-19_001',
        synthetic: true,
        source: 'mleandro0210 confirmó por WhatsApp app que envió este mensaje el 19/06/2026; el export no lo incluyó (mensaje no sincronizado al momento de exportar). Re-verificado en la app de WhatsApp por el admin.'
    },
    {
    "Time": "2026/6/11 11:00:39",
    "Formatted Name": "Jhon Esposo Diana Gómez",
    "Display Name": "Yohn Alcaraz",
    "Message": "Mexico vs Sudáfrica\n1-2\nCorea del sur vs checa\n1-2\n\nCampeón Alemania\nSubcampeon colombia\nGoleador  luis diaz",
    "Caption": "",
    "Type": "chat",
    "Phone": "+57 322 4422883",
    "Message Id": "false_120363407879464968@g.us_ACD3C5E8CC5270FC4A115AACE98D1FEC_37168764428447@lid"
  },
];
