import { jsPDF } from 'jspdf';
import { ShuffledResult } from '../types/index.ts';

/**
 * Generates a publication-grade, printer-friendly PDF for shuffled list results
 * with distinct styling for prioritized vs standard randomized items.
 */
export function exportShuffledListToPDF(result: ShuffledResult): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;

  let currentY = margin;

  // Header Background Card
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, currentY, contentWidth, 36, 3, 3, 'FD');

  // Brand / App Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229); // indigo-600
  doc.text('SHUFFLE  •  RANDOMIZED LIST EXPORT', margin + 6, currentY + 8);

  // Category Tag
  const categoryText = result.category.toUpperCase();
  const catWidth = doc.getTextWidth(categoryText) + 8;
  doc.setFillColor(238, 242, 255); // indigo-50
  doc.setDrawColor(199, 210, 254);
  doc.roundedRect(pageWidth - margin - catWidth - 6, currentY + 4, catWidth, 6, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(67, 56, 202);
  doc.text(categoryText, pageWidth - margin - catWidth - 2, currentY + 8.2);

  // List Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  const titleLines = doc.splitTextToSize(result.listName, contentWidth - 12);
  doc.text(titleLines[0], margin + 6, currentY + 18);

  // Metadata Row (Creator, Date, Items count)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // slate-500
  const formattedDate = new Date(result.shuffledAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const metaText = `Creator: ${result.creatorName} (${result.creatorEmail})  |  Generated: ${formattedDate}`;
  doc.text(metaText, margin + 6, currentY + 25);

  const statsText = `Total Items: ${result.items.length}  •  Prioritized: ${result.prioritizedCount}  •  Standard: ${result.unprioritizedCount}`;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(statsText, margin + 6, currentY + 31);

  currentY += 44;

  const checkPageOverflow = (requiredHeight: number) => {
    if (currentY + requiredHeight > pageHeight - margin - 15) {
      doc.addPage();
      currentY = margin + 5;
      // Repeat small mini-header on subsequent pages
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`${result.listName} (Continued)`, margin, currentY);
      currentY += 8;
    }
  };

  // Render items
  result.items.forEach((item, index) => {
    // Determine card styling based on prioritization
    const isPriority = item.prioritized;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const textMaxWidth = contentWidth - 36;
    const itemLines = doc.splitTextToSize(item.text, textMaxWidth);
    const boxHeight = Math.max(14, itemLines.length * 5 + 8);

    checkPageOverflow(boxHeight + 4);

    if (isPriority) {
      // Prioritized item card: Warm amber/gold highlight
      doc.setFillColor(254, 252, 232); // amber-50
      doc.setDrawColor(251, 191, 36); // amber-400
      doc.setLineWidth(0.4);
      doc.roundedRect(margin, currentY, contentWidth, boxHeight, 2.5, 2.5, 'FD');

      // Priority Ribbon / Star Icon
      doc.setFillColor(245, 158, 11); // amber-500
      doc.roundedRect(margin + 3, currentY + 3, 14, 6, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text('PRIORITY', margin + 4.2, currentY + 7.2);
    } else {
      // Standard item card: Clean white with subtle border
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.2);
      doc.roundedRect(margin, currentY, contentWidth, boxHeight, 2.5, 2.5, 'FD');
    }

    // Rank Badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    if (isPriority) {
      doc.setTextColor(180, 83, 9); // amber-700
    } else {
      doc.setTextColor(99, 102, 241); // indigo-500
    }
    const rankStr = `#${item.rank}`;
    doc.text(rankStr, margin + 4, currentY + (isPriority ? 12.5 : 9));

    // Printable tick-off Checkbox on the right
    doc.setDrawColor(148, 163, 184); // slate-400
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.3);
    const checkSize = 4.5;
    doc.roundedRect(pageWidth - margin - checkSize - 5, currentY + (boxHeight - checkSize) / 2, checkSize, checkSize, 1, 1, 'FD');

    // Item Text
    doc.setFont('helvetica', isPriority ? 'bold' : 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(itemLines, margin + 22, currentY + 7);

    currentY += boxHeight + 3.5;
  });

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);

    // Bottom line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - margin + 4, pageWidth - margin, pageHeight - margin + 4);

    doc.text(
      `Shuffle App  •  Preserving Priority Order at Top  •  All selected items randomized fairly`,
      margin,
      pageHeight - margin + 9
    );
    doc.text(
      `Page ${p} of ${totalPages}`,
      pageWidth - margin - doc.getTextWidth(`Page ${p} of ${totalPages}`),
      pageHeight - margin + 9
    );
  }

  // Trigger download
  const safeFilename = result.listName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  doc.save(`shuffle-${safeFilename}-${Date.now().toString().slice(-4)}.pdf`);
}
