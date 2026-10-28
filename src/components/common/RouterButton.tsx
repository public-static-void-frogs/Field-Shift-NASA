import { Button } from 'antd';
import type { MouseEvent } from 'react';
import { useHref, useLinkClickHandler } from 'react-router-dom';
import type { RouterButtonProps } from '../../types/shared/RouterButton.types.ts';

// Ant Design styling with React Router's native link and modifier-key behavior.
export function RouterButton({
  to,
  replace,
  state,
  preventScrollReset,
  relative,
  onClick,
  ...props
}: RouterButtonProps) {
  const href = useHref(to, { relative });
  const handleClick = useLinkClickHandler(to, {
    replace,
    state,
    preventScrollReset,
    relative,
    target: props.target,
  });

  return (
    <Button
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          handleClick(event as MouseEvent<HTMLAnchorElement>);
        }
      }}
    />
  );
}
