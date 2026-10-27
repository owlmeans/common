/** Where a sent message stands: nothing sent, waiting for the bot, the bot acted, or it stayed silent. */
export type SimulatorState = 'idle' | 'waiting' | 'reacted' | 'silent'
