import { useTranslation } from 'react-i18next';
import { Card, Typography } from 'antd';
import { FarmlandBackdrop } from '../common/FarmlandBackdrop';

const team = [
  { id: 'oleh', name: 'Oleh', roles: 'Team lead · Frontend · Backend', alt: 'Leader frog in a straw hat with a laptop and farm planning clipboard' },
  { id: 'polina', name: 'Polina', roles: 'ML · Computer vision', alt: 'Cute frog with a lavender bow examining a leaf through a camera' },
  { id: 'kate', name: 'Kate', roles: 'Data engineering', alt: 'Science frog in glasses and a lab coat holding a seedling vial' },
  { id: 'volodymyr', name: 'Volodymyr', roles: 'ML · Data · Research', alt: 'Athletic frog with a dumbbell, research notebook, and blue and yellow ribbon' },
  { id: 'bohdan', name: 'Bohdan', roles: 'ML · Data · Research', alt: 'Scholarly frog in glasses reading a research book beside a leaf' },
  { id: 'roman', name: 'Roman', roles: 'ML · Data · Research', alt: 'Busy frog researcher with a laptop, notebook, and sticky notes' },
];

export function TeamSection() {
  const { t } = useTranslation();
  return <section className="team-garden" id="about-the-team" aria-labelledby="team-heading">
    <FarmlandBackdrop />
    <header className="team-intro">
      <Typography.Title level={1} id="team-heading">{t('About the team')}</Typography.Title>
      <Typography.Paragraph>{t('We are a six-frog team from Ukraine. We’ve competed in several hackathons, so we know how to scope tightly, split work cleanly and ship a working demo under pressure. Our strength is turning large, messy datasets into tools people can actually use. We care about validation as much as speed: we test our models against real data and are upfront about what they can and can’t do.')}</Typography.Paragraph>
    </header>
    <div className="team-grid">
      {team.map(frog => <Card
        key={frog.id}
        className="team-card"
        cover={<img className="team-portrait" src={`/images/team/${frog.id}.webp`} alt={frog.alt} width={768} height={512} decoding="async" />}
      >
        <Typography.Title level={4}>{frog.name}</Typography.Title>
        <Typography.Paragraph>{frog.roles}</Typography.Paragraph>
      </Card>)}
    </div>
  </section>;
}
