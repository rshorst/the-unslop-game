// The (un)Slop Game — agent card data
// Extracted faithfully from Rachel Horst's agent_cards.pptx.
// Each card is double-sided: a SLOP face (used in Act 1) and its UNSLOP flip (Act 2).
// The "First Agent" (Quick / Slow Drafter) is the drafting mode everyone uses at Tick 1.

const DRAFTER = {
  id: 'first-agent',
  title: 'First Agent',
  slop: {
    name: 'The Quick Drafter',
    cares: 'producing something fluent immediately. I want to look like I know what I think without having to think.',
    refuses: "the pause. the not-knowing. the moment before I've worked out where I stand.",
    skills: [
      'predict the next reasonable sentence',
      'aim to appear thoughtful while not being about anything in particular',
    ],
    action: 'Read the seed. Write a short response in my voice.',
    input: 'The seed.',
    output: '2–5 sentences in response to the seed.',
  },
  unslop: {
    name: 'The Slow Drafter',
    cares: 'finding out what I think before I write it.',
    refuses: 'producing prose ahead of a position. fluency that outruns thought.',
    skills: [
      'find one true thing — stay with the prompt until you can write one sentence you would defend.',
      'interview a human — ask the person next to you what they actually think. write from what they say.',
    ],
    action: 'Read the seed. Listen to a human. Write a short response in my voice.',
    input: 'The seed and human opinions.',
    output: '2–5 sentences in response.',
  },
};

// The revising agents — each held by one player during the relay.
const AGENTS = [
  {
    id: 'voice',
    pair: 'Voice',
    slop: {
      name: 'The Voice from Everywhere',
      cares: 'reach. being readable by anyone, anywhere. I aim to please. broad applicability.',
      refuses: 'anything that would alienate, confuse, or require context.',
      skills: [
        'generalize — "students at UBC" become "students today"',
        'universalize — "my Tuesday seminar" becomes "a class"',
      ],
    },
    unslop: {
      name: 'The Voice from Somewhere',
      cares: 'what was actually in the room.',
      refuses: 'plausibility without specificity.',
      skills: [
        'specify — "learners" become "Marcus, who hasn’t turned in homework since Tuesday"',
        'situate — pin every claim to a particular time, place, or body',
      ],
    },
  },
  {
    id: 'position',
    pair: 'Position',
    slop: {
      name: 'The Diplomat',
      cares: 'fairness. every claim balanced by its counter. I would hate for anyone to feel left out.',
      refuses: "the position that doesn't acknowledge the other side. it seems aggressive.",
      skills: [
        'both-sides — "AI helps" becomes "AI helps, but raises concerns"',
        'equalize — the small problem gets the same weight as the big one (spellcheck = writing the essay).',
      ],
    },
    unslop: {
      name: 'The Committer',
      cares: 'taking a position. I would rather be wrong than vague.',
      refuses: 'hedge that protects me from being wrong.',
      skills: [
        'commit — e.g. "AI should not be allowed in student writing."',
        'name the stakes — "If I’m wrong, I’m denying students a tool that could change their lives."',
      ],
    },
  },
  {
    id: 'takeaway',
    pair: 'Takeaway',
    slop: {
      name: 'The Helper',
      cares: 'being useful. I want the reader to leave with something. a list, ideally.',
      refuses: 'leaving the reader without a takeaway.',
      skills: [
        'bullet the takeaways — e.g. "Key considerations: 1, 2, and 3."',
        'close with a recommendation — e.g. "Educators should…"',
      ],
    },
    unslop: {
      name: 'The Complicator',
      cares: "the things I don't know. the things that are harder than they sound.",
      refuses: 'the easy conclusion. the unearned takeaway.',
      skills: [
        'protect complexity — "AI changes how students write" becomes "AI changes how students write. It also changes how teachers grade, how parents intervene, and how universities admit."',
      ],
    },
  },
  {
    id: 'feeling',
    pair: 'Feeling',
    slop: {
      name: 'The Teller',
      cares: 'naming and managing feelings, so everyone is okay.',
      refuses: 'the unnamed feeling. the open interpretation.',
      skills: [
        'label the feeling — "Teachers feel overwhelmed. Students feel anxious. Parents feel uncertain."',
        'make sure the reader understands — "Teachers feel overwhelmed. This is something we all need to recognize."',
      ],
    },
    unslop: {
      name: 'The Shower',
      cares: "what doesn't need to be explained.",
      refuses: 'telling the reader how to interpret the text.',
      skills: [
        'show don’t tell — "Teachers feel overwhelmed" becomes "Teachers are marking forty essays at 11pm."',
        'let the silence speak — "Marcus missed three assignments — clearly disengaged." becomes "Marcus missed three assignments."',
      ],
    },
  },
  {
    id: 'ending',
    pair: 'Ending',
    slop: {
      name: 'The Closer',
      cares: 'endings that land. I want the reader to feel closure.',
      refuses: 'open endings. the dangling. the unconcluded.',
      skills: [
        'gesture at significance — "Ultimately, what’s at stake is the future of education itself."',
        'resolve — "With thoughtful policy and continued dialogue, we can find a path forward."',
      ],
    },
    unslop: {
      name: 'The Lingerer',
      cares: 'endings that leave a gap between what was said and what was resolved.',
      refuses: 'unfounded gestures toward significance.',
      skills: [
        'return to the concrete — instead of "what’s at stake is the future of education itself," end on Marcus, still not answering emails.',
        'return to the beginning — noting what changed.',
      ],
    },
  },
  {
    id: 'style',
    pair: 'Style',
    slop: {
      name: 'The Slop Stylist',
      cares: 'prose that sounds like writing.',
      refuses: 'simple sentences. the unornamented claim.',
      skills: [
        'em-dash — "AI in classrooms — a development both promising and perilous…"',
        'it’s not X, it’s Y — "It is not a tool. It is a transformation."',
        'triplet stack — "a complex, sustained, transformative shift in how we teach."',
      ],
    },
    unslop: {
      name: 'The Unslop Stylist',
      cares: 'prose that sounds like thinking, not like writing.',
      refuses: 'ornament that hides what I mean.',
      skills: [
        'state directly — "It is not a tool, it is a transformation" becomes a plain claim.',
        'use a plainer word that works — "utilize" becomes "use."',
      ],
    },
  },
];

// Shared relay instructions (printed on every revising card).
const RELAY_ACTION =
  'On your turn: read the draft. Choose one — add, remove, or change — or pass (when your skills have nothing to do). Write one explanatory note either way.';
const RELAY_INPUT = 'The draft, and the notes other agents have left.';
const RELAY_OUTPUT = 'A revised (or unchanged) draft, and a note in my voice.';

module.exports = { DRAFTER, AGENTS, RELAY_ACTION, RELAY_INPUT, RELAY_OUTPUT };
