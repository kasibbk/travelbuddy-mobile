export type Ride = {
  id: string;
  title: string;
  route: string;
  start: string;
  destination: string;
  date: string;
  time: string;
  distance: string;
  duration: string;
  riders: number;
  spots: number;
  host: string;
  image: string;
  tag: string;
};

export type Rider = {
  id: string;
  name: string;
  initials: string;
  distance: string;
  note: string;
  mutual: string;
  color: string;
};

export const rides: Ride[] = [
  {
    id: "coastline",
    title: "Coastline & coffee",
    route: "San Francisco → Half Moon Bay",
    start: "San Francisco",
    destination: "Half Moon Bay",
    date: "Sat, Oct 17",
    time: "8:30 AM",
    distance: "34 mi",
    duration: "2 hours",
    riders: 4,
    spots: 2,
    host: "Maya Chen",
    image: "https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=1000&q=85",
    tag: "Scenic",
  },
  {
    id: "wine-country",
    title: "The long way to wine country",
    route: "Oakland → Sonoma",
    start: "Oakland",
    destination: "Sonoma",
    date: "Sun, Oct 18",
    time: "9:00 AM",
    distance: "51 mi",
    duration: "3 hours",
    riders: 3,
    spots: 3,
    host: "Theo Martinez",
    image: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1000&q=85",
    tag: "All levels",
  },
  {
    id: "redwoods",
    title: "Redwoods before brunch",
    route: "Daly City → Muir Woods",
    start: "Daly City",
    destination: "Muir Woods",
    date: "Sat, Oct 24",
    time: "7:15 AM",
    distance: "28 mi",
    duration: "2.5 hours",
    riders: 5,
    spots: 1,
    host: "Sophie Park",
    image: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1000&q=85",
    tag: "Early start",
  },
];

export const nearbyRiders: Rider[] = [
  { id: "alex", name: "Alex Lee", initials: "AL", distance: "1.2 mi", note: "3 shared rides · coastal routes", mutual: "Maya, Nina + 1", color: "#D58B68" },
  { id: "jordan", name: "Jordan Rivera", initials: "JR", distance: "2.4 mi", note: "5 shared interests · weekend rider", mutual: "Theo + 2 friends", color: "#6B9380" },
  { id: "nina", name: "Nina Kim", initials: "NK", distance: "3.1 mi", note: "Rides with Maya · coffee stops", mutual: "Maya Chen", color: "#B58D59" },
  { id: "sam", name: "Sam Patel", initials: "SP", distance: "4.8 mi", note: "2 shared rides · all-pace rider", mutual: "Alex + 1 friend", color: "#8799B0" },
  { id: "rory", name: "Rory Williams", initials: "RW", distance: "5.2 mi", note: "Same favorite routes · 4 rides", mutual: "Jordan Rivera", color: "#B77F89" },
];

export const avatarColors = ["#D58B68", "#6B9380", "#B58D59", "#8799B0", "#B77F89"];