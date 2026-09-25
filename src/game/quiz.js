// Quiz terminal questions. `a` is the index of the correct choice.
export const QUESTIONS = [
  { cat: 'Pattern', q: 'What comes next? 2, 4, 8, 16, ...', c: ['24', '32', '30', '20'], a: 1 },
  { cat: 'Pattern', q: 'What comes next? 1, 1, 2, 3, 5, 8, ...', c: ['11', '12', '13', '14'], a: 2 },
  { cat: 'Pattern', q: 'What comes next? 3, 6, 9, 12, ...', c: ['14', '15', '16', '18'], a: 1 },
  { cat: 'Pattern', q: 'What comes next? 1, 4, 9, 16, 25, ...', c: ['30', '35', '36', '49'], a: 2 },
  { cat: 'Pattern', q: 'Which letter comes next? A, C, E, G, ...', c: ['H', 'I', 'J', 'K'], a: 1 },
  { cat: 'Pattern', q: 'What comes next? 100, 90, 81, 73, ...', c: ['64', '65', '66', '67'], a: 2 },
  { cat: 'Math', q: 'What is 7 × 8?', c: ['54', '56', '58', '64'], a: 1 },
  { cat: 'Math', q: 'What is 15% of 200?', c: ['15', '20', '30', '35'], a: 2 },
  { cat: 'Math', q: 'What is 12 + 18 ÷ 3?', c: ['10', '18', '24', '30'], a: 1 },
  { cat: 'Math', q: 'A square has a perimeter of 20 m. What is its area?', c: ['16 m²', '20 m²', '25 m²', '40 m²'], a: 2 },
  { cat: 'Math', q: 'What is half of a quarter?', c: ['1/6', '1/8', '1/2', '1/16'], a: 1 },
  { cat: 'Math', q: 'How many seconds are in 3 minutes?', c: ['120', '150', '180', '300'], a: 2 },
  { cat: 'Math', q: 'If 3 Echoes weigh 6 kg, how much do 5 Echoes weigh?', c: ['8 kg', '10 kg', '12 kg', '15 kg'], a: 1 },
  { cat: 'Logic', q: 'All robots are machines. Dli is a robot. So Dli is...', c: ['A human', 'A machine', 'Not a machine', 'Impossible to tell'], a: 1 },
  { cat: 'Logic', q: 'If today is Monday, what day is it 10 days from now?', c: ['Wednesday', 'Thursday', 'Friday', 'Sunday'], a: 1 },
  { cat: 'Logic', q: 'Tom is taller than Ann. Ann is taller than Bo. Who is the shortest?', c: ['Tom', 'Ann', 'Bo', 'They are equal'], a: 2 },
  { cat: 'Logic', q: 'A door needs two plates held. You can leave one Echo and stand on one plate yourself. Does the door open?', c: ['Yes', 'No', 'Only at night', 'Only if you jump'], a: 0 },
  { cat: 'Logic', q: 'You are in a race and pass the person in 2nd place. What place are you in now?', c: ['1st', '2nd', '3rd', 'Last'], a: 1 },
  { cat: 'Logic', q: 'Which one does NOT belong? Cube, Sphere, Square, Pyramid', c: ['Cube', 'Sphere', 'Square', 'Pyramid'], a: 2 },
  { cat: 'Logic', q: 'A farmer has 17 sheep. All but 9 run away. How many are left?', c: ['8', '9', '17', '0'], a: 1 },
  { cat: 'Logic', q: 'How many months have 28 days?', c: ['1', '2', '6', '12'], a: 3 },
  { cat: 'Riddle', q: 'What has keys but can\'t open locks?', c: ['A map', 'A piano', 'A door', 'A cloud'], a: 1 },
  { cat: 'Riddle', q: 'What gets wetter the more it dries?', c: ['A towel', 'A sponge', 'Rain', 'Ice'], a: 0 },
  { cat: 'Riddle', q: 'What has hands but can\'t clap?', c: ['A statue', 'A clock', 'A glove', 'A tree'], a: 1 },
  { cat: 'Riddle', q: 'The more you take, the more you leave behind. What are they?', c: ['Coins', 'Footsteps', 'Photos', 'Breaths'], a: 1 },
  { cat: 'Riddle', q: 'What can travel around the world while staying in a corner?', c: ['A stamp', 'A spider', 'A shadow', 'The wind'], a: 0 },
  { cat: 'Riddle', q: 'What has one eye but can\'t see?', c: ['A storm', 'A needle', 'A potato', 'All of these'], a: 3 },
  { cat: 'Riddle', q: 'I\'m left behind every time you fail, and I help you win. What am I?', c: ['A checkpoint', 'An Echo', 'A door', 'A laser'], a: 1 },
  { cat: 'Science', q: 'Which planet is known as the Red Planet?', c: ['Venus', 'Jupiter', 'Mars', 'Mercury'], a: 2 },
  { cat: 'Science', q: 'What gas do plants absorb from the air?', c: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'], a: 2 },
  { cat: 'Science', q: 'Water boils at what temperature at sea level?', c: ['90 °C', '100 °C', '110 °C', '120 °C'], a: 1 },
  { cat: 'Science', q: 'What force pulls you back down after you jump?', c: ['Magnetism', 'Friction', 'Gravity', 'Wind'], a: 2 },
  { cat: 'Science', q: 'What is the closest star to Earth?', c: ['Sirius', 'The Sun', 'Polaris', 'The Moon'], a: 1 },
  { cat: 'Science', q: 'How many legs does a spider have?', c: ['6', '8', '10', '12'], a: 1 },
  { cat: 'Tech', q: 'What does "www" stand for in a web address?', c: ['World Wide Web', 'Wide World Web', 'Web World Wide', 'World Web Wire'], a: 0 },
  { cat: 'Tech', q: 'How many bits are in one byte?', c: ['4', '8', '16', '32'], a: 1 },
  { cat: 'Tech', q: 'Which of these is used to send a message in a chat app?', c: ['Send button', 'Volume key', 'Power cable', 'Screen protector'], a: 0 },
  { cat: 'Tech', q: 'What is 1010 in binary equal to in decimal?', c: ['8', '10', '12', '1010'], a: 1 },
];

/** Picks random questions without repeats until the bank runs out. */
export class QuizDeck {
  constructor(questions = QUESTIONS, random = Math.random) {
    this.questions = questions;
    this.random = random;
    this.pile = [];
  }

  next() {
    if (!this.pile.length) {
      this.pile = [...this.questions];
      for (let i = this.pile.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.pile[i], this.pile[j]] = [this.pile[j], this.pile[i]];
      }
    }
    return this.pile.pop();
  }
}
