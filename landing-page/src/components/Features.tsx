import { Card } from "@/components/ui/card";

export default function Features() {
  const features = [
    {
      title: "Intelligent Filtering",
      description: "Uses AI to identify and surface only the messages that are relevant to your interests."
    },
    {
      title: "Customizable Focus",
      description: "Define keywords and topics to tailor the filtering to your specific needs."
    },
    {
      title: "Stay Informed",
      description: "Never miss important announcements, discussions, or opportunities within your groups."
    }
  ];

  return (
    <section className="py-16 px-8">
      <h2 className="text-2xl font-bold text-center" style={{ color: 'var(--secondary-color)' }}>Features</h2>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        {features.map((feature, index) => (
          <Card key={index} className="p-6 text-center">
            <h3 className="text-xl font-semibold" style={{ color: 'var(--secondary-color)' }}>{feature.title}</h3>
            <p className="mt-2 text-gray-700">{feature.description}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
