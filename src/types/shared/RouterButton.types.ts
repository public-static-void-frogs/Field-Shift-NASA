import type { ButtonProps } from 'antd';
import type { LinkProps } from 'react-router-dom';
export type RouterButtonProps = Omit<ButtonProps, 'href'> &
  Pick<LinkProps, 'to' | 'replace' | 'state' | 'preventScrollReset' | 'relative'>;
