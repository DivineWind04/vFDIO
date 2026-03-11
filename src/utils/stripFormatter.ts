/**
 * Formats flight strip data from field values into an ERAM-style multi-line display string.
 * Used by both the ReceiveStripItems hub handler and the SR (Strip Request) command.
 */
export function formatStripFromFieldValues(fieldValues: string[]): string {
  // Fixed column positions based on ERAM reference (80 char width)
  // Line 1: Aircraft ID (1-17), Beacon (19-23), Departure Point (25-36), Route (41-80)
  const line1_aircraftId = (fieldValues[0] || '').substring(0, 7).padEnd(14);
  const line1_beacon = (fieldValues[5] || '').substring(0, 4).padEnd(6);
  const line1_depPoint = (fieldValues[8]?.split(' ')[0] || '').substring(0, 7).padEnd(9);

  // Remove embedded newlines from route (both literal \n and escaped \\n) and replace with spaces
  let route = (fieldValues[11] || '');
  route = route.replace(/\\n/g, ' ').replace(/\n/g, ' ');
  let line2_route = '';

  // Line 2: Revision Number (starts at position 3)
  const line2 = '  ' + (fieldValues[1] || '');

  // Line 3: Aircraft Type/Equipment (starts at column 1)
  const line3_typeEquip = (fieldValues[3] || '').substring(0, 14).padEnd(14);
  const line3_time = (fieldValues[6] || '').substring(0, 6).padEnd(6);

  // Line 4: CID (1-17), Altitude (19-23), Remarks (41-80)
  const line4_cid = (fieldValues[4] || '').substring(0, 4).padEnd(14);
  const line4_altitude = (fieldValues[7] || '').substring(0, 4).padEnd(15);
  let line4_remarks = (fieldValues[12] || '').substring(0, 40);
  if (route.split('○').length > 1) {
    line4_remarks = `○${route.split('○')[1]}`.substring(0, 40);
    route = route.split('○')[0]; // Show only the part before the ○ in the route field
  }

  let line1_route_display = route.substring(0, 40);

  if (route.length > 40) {
    const first40 = route.slice(0, 40);
    const lastSpace = first40.lastIndexOf(' ');
    const splitIndex = lastSpace !== -1 ? lastSpace : 40;

    // Line 1 shows route up to the word boundary
    line1_route_display = route.slice(0, splitIndex);
    // Line 2 shows ONLY the continuation, padded so it aligns at column 41
    const secondLine = route.slice(splitIndex).trimStart();
    line2_route = secondLine;
  }

  // Build strip: Line1 + Line2(revision + route cont) + Line3(type/time) + Line4(cid/alt/remarks)
  return (
    line1_aircraftId + line1_beacon + line1_depPoint + line1_route_display + '\n' +
    line2 + '\n' +
    line3_typeEquip + line3_time + line2_route + '\n\n' +
    line4_cid + line4_altitude + line4_remarks
  );
}
