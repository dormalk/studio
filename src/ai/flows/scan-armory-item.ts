'use server';

/**
 * @fileOverview An armory item scanner AI agent.
 *
 * - scanArmoryItem - A function that handles the armory item scanning process.
 * - ScanArmoryItemInput - The input type for the scanArmoryItem function.
 * - ScanArmoryItemOutput - The return type for the scanArmoryItem function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ScanArmoryItemInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      'A photo of the armory item, as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.' // keep the backslashes
    ),
});
export type ScanArmoryItemInput = z.infer<typeof ScanArmoryItemInputSchema>;

const ScanArmoryItemOutputSchema = z.object({
  itemType: z.string().describe('The type of the scanned armory item.'),
  itemId: z.string().describe('The unique identifier of the armory item.'),
});
export type ScanArmoryItemOutput = z.infer<typeof ScanArmoryItemOutputSchema>;

export async function scanArmoryItem(input: ScanArmoryItemInput): Promise<ScanArmoryItemOutput> {
  return scanArmoryItemFlow(input);
}

const prompt = ai.definePrompt({
  name: 'scanArmoryItemPrompt',
  input: {schema: ScanArmoryItemInputSchema},
  output: {schema: ScanArmoryItemOutputSchema},
  prompt: `You are an expert in identifying armory items.

You will use the image to identify the type of armory item and its unique ID, if visible. If the ID is not visible, generate a placeholder ID.

Analyze the following image:
{{media url=photoDataUri}}

Return the item type and item ID in JSON format.`,
});

const scanArmoryItemFlow = ai.defineFlow(
  {
    name: 'scanArmoryItemFlow',
    inputSchema: ScanArmoryItemInputSchema,
    outputSchema: ScanArmoryItemOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
