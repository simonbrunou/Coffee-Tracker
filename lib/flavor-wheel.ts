/* ============ SCA Coffee Taster's Flavor Wheel (WCR/SCA) ============
   Faithful taxonomy: 9 top categories → groups → leaf descriptors.
   Colors follow the published wheel's signature hues. */
import type { WheelCategory } from "./types";

export const FLAVOR_WHEEL: WheelCategory[] = [
  {
    name: "Floral",
    color: "#C75B95",
    groups: [
      { name: "Black Tea", notes: ["Black Tea"] },
      { name: "Floral", notes: ["Chamomile", "Rose", "Jasmine"] },
    ],
  },
  {
    name: "Fruity",
    color: "#C0264A",
    groups: [
      { name: "Berry", notes: ["Blackberry", "Raspberry", "Blueberry", "Strawberry", "Cranberry"] },
      { name: "Dried Fruit", notes: ["Raisin", "Prune"] },
      {
        name: "Other Fruit",
        notes: ["Coconut", "Cherry", "Pomegranate", "Pineapple", "Grape", "Apple", "Peach", "Pear"],
      },
      { name: "Citrus Fruit", notes: ["Grapefruit", "Orange", "Lemon", "Lime"] },
    ],
  },
  {
    name: "Sour / Fermented",
    color: "#C9B53A",
    groups: [
      {
        name: "Sour",
        notes: ["Sour Aromatics", "Acetic Acid", "Butyric Acid", "Isovaleric Acid", "Citric Acid", "Malic Acid"],
      },
      { name: "Alcohol / Fermented", notes: ["Winey", "Whiskey", "Fermented", "Overripe"] },
    ],
  },
  {
    name: "Green / Vegetative",
    color: "#3FA45B",
    groups: [
      { name: "Olive Oil", notes: ["Olive Oil"] },
      { name: "Raw", notes: ["Raw"] },
      {
        name: "Green / Vegetative",
        notes: ["Under-ripe", "Peapod", "Fresh", "Dark Green", "Vegetative", "Hay-like", "Herb-like"],
      },
      { name: "Beany", notes: ["Beany"] },
    ],
  },
  {
    name: "Other",
    color: "#5FA9BC",
    groups: [
      {
        name: "Papery / Musty",
        notes: [
          "Stale", "Cardboard", "Papery", "Woody", "Moldy / Damp",
          "Musty / Earthy", "Musty / Dusty", "Animalic", "Meaty Brothy", "Phenolic",
        ],
      },
      { name: "Chemical", notes: ["Bitter", "Salty", "Medicinal", "Petroleum", "Skunky", "Rubber"] },
    ],
  },
  {
    name: "Roasted",
    color: "#C2542F",
    groups: [
      { name: "Tobacco", notes: ["Pipe Tobacco", "Tobacco"] },
      { name: "Burnt", notes: ["Acrid", "Ashy", "Smoky", "Brown Roast"] },
      { name: "Cereal", notes: ["Grain", "Malt"] },
    ],
  },
  {
    name: "Spices",
    color: "#B5202C",
    groups: [
      { name: "Pungent", notes: ["Pungent"] },
      { name: "Pepper", notes: ["Pepper"] },
      { name: "Brown Spice", notes: ["Anise", "Nutmeg", "Cinnamon", "Clove"] },
    ],
  },
  {
    name: "Nutty / Cocoa",
    color: "#8C5A33",
    groups: [
      { name: "Nutty", notes: ["Peanuts", "Hazelnut", "Almond"] },
      { name: "Cocoa", notes: ["Chocolate", "Dark Chocolate"] },
    ],
  },
  {
    name: "Sweet",
    color: "#E0902F",
    groups: [
      { name: "Brown Sugar", notes: ["Molasses", "Maple Syrup", "Caramelized", "Honey"] },
      { name: "Vanilla", notes: ["Vanilla"] },
      { name: "Vanillin", notes: ["Vanillin"] },
      { name: "Overall Sweet", notes: ["Overall Sweet"] },
      { name: "Sweet Aromatics", notes: ["Sweet Aromatics"] },
    ],
  },
];

/** Flat leaf → color map (for chips). Includes a few legacy seed names. */
export const WHEEL_FLAT: Record<string, string> = (() => {
  const flat: Record<string, string> = {};
  for (const cat of FLAVOR_WHEEL) {
    for (const g of cat.groups) {
      for (const n of g.notes) flat[n] = cat.color;
    }
  }
  const legacy: Record<string, string> = {
    "Stone Fruit": "#C0264A", Citrus: "#E0902F", "Brown Sugar": "#E0902F",
    Tropical: "#E0902F", Toffee: "#8C5A33", Caramel: "#E0902F", "Red Apple": "#C0264A",
    Plum: "#C0264A", Cocoa: "#8C5A33", Floral: "#C75B95", Maple: "#E0902F",
  };
  return { ...flat, ...legacy };
})();
