terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Tag-friendly project name."
  type        = string
  default     = "contract-console"
}

variable "instance_type" {
  description = "EC2 instance type for staging and production."
  type        = string
  default     = "t3.micro"
}

variable "deploy_key_name" {
  description = "Name for the EC2 key pair."
  type        = string
  default     = "contract-console-deploy-key"
}

variable "deploy_public_key" {
  description = "Public SSH key used for EC2 access."
  type        = string
}

locals {
  environments = toset(["staging", "production"])
}

data "aws_default_vpc" "this" {}

data "aws_subnets" "default_vpc_subnets" {
  filter {
    name   = "vpc-id"
    values = [data.aws_default_vpc.this.id]
  }
}

data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

resource "aws_key_pair" "deploy" {
  key_name   = var.deploy_key_name
  public_key = var.deploy_public_key
}

resource "aws_security_group" "ec2" {
  for_each = locals.environments

  name        = "${var.project_name}-${each.key}-sg"
  description = "Security group for ${each.key} EC2 instance"
  vpc_id      = data.aws_default_vpc.this.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH - tighten in production"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-${each.key}-sg"
    Environment = each.key
    Project     = var.project_name
  }
}

resource "aws_iam_role" "ec2_ssm_role" {
  for_each = locals.environments

  name = "${var.project_name}-${each.key}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  for_each = locals.environments

  role       = aws_iam_role.ec2_ssm_role[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2_profile" {
  for_each = locals.environments

  name = "${var.project_name}-${each.key}-ec2-profile"
  role = aws_iam_role.ec2_ssm_role[each.key].name
}

resource "aws_instance" "app" {
  for_each = locals.environments

  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnets.default_vpc_subnets.ids[0]
  vpc_security_group_ids      = [aws_security_group.ec2[each.key].id]
  key_name                    = aws_key_pair.deploy.key_name
  iam_instance_profile        = aws_iam_instance_profile.ec2_profile[each.key].name
  associate_public_ip_address = true

  root_block_device {
    volume_size = 16
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name        = "${var.project_name}-${each.key}-ec2"
    Environment = each.key
    Project     = var.project_name
  }
}

resource "aws_eip" "app" {
  for_each = locals.environments

  domain   = "vpc"
  instance = aws_instance.app[each.key].id

  tags = {
    Name        = "${var.project_name}-${each.key}-eip"
    Environment = each.key
    Project     = var.project_name
  }
}

output "instance_public_ip" {
  description = "Public Elastic IP per environment."
  value = {
    for env in locals.environments :
    env => aws_eip.app[env].public_ip
  }
}

output "instance_id" {
  description = "EC2 instance id per environment."
  value = {
    for env in locals.environments :
    env => aws_instance.app[env].id
  }
}
